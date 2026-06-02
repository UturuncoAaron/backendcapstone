import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import {
  CreateNotificationDto,
  CreateBulkNotificationDto,
} from './dto/notification.dto.js';
import {
  NOTIFICATION_EVENT_NAMES,
  PeriodExpiredEvent,
} from './events/notification-events.js';

/** TTL por defecto para auto-limpieza (días). */
export const NOTIFICATION_TTL_DAYS = 14;
/** Límite duro: aunque queden sin leer, se borran. Evita acumulación infinita. */
export const NOTIFICATION_HARD_TTL_DAYS = 30;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly emitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) { }

  // ════════════════════════════════════════════════════════════
  // CREAR — usado por el listener de eventos
  // ════════════════════════════════════════════════════════════

  async notify(dto: CreateNotificationDto): Promise<Notification> {
    const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_DAYS * 86_400_000);
    const notification = this.repo.create({ ...dto, expiresAt });
    const saved = await this.repo.save(notification);
    this.logger.log(
      `notification_created tipo=${saved.tipo} accountId=${saved.accountId} id=${saved.id}`,
    );
    return saved;
  }

  async notifyBulk(dto: CreateBulkNotificationDto): Promise<Notification[]> {
    if (dto.accountIds.length === 0) return [];
    const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_DAYS * 86_400_000);
    const notifications = dto.accountIds.map((accountId) =>
      this.repo.create({
        accountId,
        tipo: dto.tipo,
        titulo: dto.titulo,
        cuerpo: dto.cuerpo,
        referenceId: dto.referenceId,
        referenceType: dto.referenceType,
        expiresAt,
      }),
    );
    const saved = await this.repo.save(notifications);
    this.logger.log(
      `notification_bulk_created tipo=${dto.tipo} count=${saved.length}`,
    );
    return saved;
  }

  // ════════════════════════════════════════════════════════════
  // LEER
  // ════════════════════════════════════════════════════════════

  async getMyNotifications(
    accountId: string,
    opts: { onlyUnread?: boolean; limit?: number; before?: string } = {},
  ): Promise<Notification[]> {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.cuenta_id = :id', { id: accountId })
      .andWhere('(n.expires_at IS NULL OR n.expires_at > NOW())')
      .orderBy('n.created_at', 'DESC')
      .limit(Math.min(opts.limit ?? 50, 100));

    if (opts.onlyUnread) qb.andWhere('n.leida = false');
    if (opts.before)
      qb.andWhere('n.created_at < :before', { before: opts.before });

    return qb.getMany();
  }

  async getUnreadCount(accountId: string): Promise<number> {
    return this.repo
      .createQueryBuilder('n')
      .where('n.cuenta_id = :id', { id: accountId })
      .andWhere('n.leida = false')
      .andWhere('(n.expires_at IS NULL OR n.expires_at > NOW())')
      .getCount();
  }

  // ════════════════════════════════════════════════════════════
  // MARCAR COMO LEÍDA
  // ════════════════════════════════════════════════════════════

  async markOneAsRead(id: string, accountId: string): Promise<{ ok: true }> {
    const r = await this.repo.update({ id, accountId }, { read: true });
    if (r.affected === 0) {
      throw new NotFoundException('Notificación no encontrada');
    }
    return { ok: true };
  }

  async markAllAsRead(accountId: string): Promise<{ updated: number }> {
    const r = await this.repo.update(
      { accountId, read: false },
      { read: true },
    );
    return { updated: r.affected ?? 0 };
  }

  // ════════════════════════════════════════════════════════════
  // CRON — Detectar periodos vencidos sin activación
  // Corre cada día a las 06:00 hora Lima.
  // Condiciones para emitir:
  //   1. El periodo está activo=FALSE y su fecha_fin ya pasó (ayer o antes)
  //   2. El año lectivo está 'en_curso'
  //   3. Ningún otro periodo del mismo año está activo=TRUE
  //   4. No existe ya una notif de tipo 'periodo_vencido' para ese periodo
  //      creada en los últimos 3 días (dedup — evita spam si el admin ignora)
  // ════════════════════════════════════════════════════════════

  @Cron('0 6 * * *', { timeZone: 'America/Lima' })
  async checkExpiredPeriods(): Promise<void> {
    try {
      // Periodos vencidos sin sucesor activo en su año
      const expired = await this.dataSource.query<
        { id: string; nombre: string; anio: number; bimestre: number }[]
      >(`
        SELECT p.id, p.nombre, p.anio, p.bimestre
        FROM   periodos p
        JOIN   anios_lectivos al ON al.anio = p.anio
        WHERE  al.estado    = 'en_curso'
          AND  p.activo     = FALSE
          AND  p.fecha_fin  < CURRENT_DATE
          AND  NOT EXISTS (
                 SELECT 1 FROM periodos p2
                 WHERE  p2.anio   = p.anio
                   AND  p2.activo = TRUE
               )
          AND  NOT EXISTS (
                 SELECT 1 FROM notificaciones n
                 WHERE  n.referencia_id   = p.id
                   AND  n.tipo            = 'periodo_vencido'
                   AND  n.created_at      > NOW() - INTERVAL '3 days'
               )
      `);

      if (expired.length === 0) return;

      // Obtener cuentas de todos los admins activos (puede haber más de uno)
      const admins = await this.dataSource.query<{ id: string }[]>(
        `SELECT id FROM cuentas WHERE rol = 'admin' AND activo = TRUE`,
      );
      const adminAccountIds = admins.map((a) => a.id);

      if (adminAccountIds.length === 0) {
        this.logger.warn('checkExpiredPeriods: no hay admins activos para notificar');
        return;
      }

      for (const p of expired) {
        const event: PeriodExpiredEvent = {
          periodoId: p.id,
          periodoNombre: p.nombre,
          anio: p.anio,
          bimestre: p.bimestre,
          adminAccountIds,
        };
        this.emitter.emit(NOTIFICATION_EVENT_NAMES.PERIOD_EXPIRED, event);
        this.logger.log(
          `period_expired_detected periodoId=${p.id} nombre="${p.nombre}" anio=${p.anio}`,
        );
      }
    } catch (err) {
      this.logger.error('checkExpiredPeriods falló', err as Error);
    }
  }

  // ════════════════════════════════════════════════════════════
  // LIMPIEZA AUTOMÁTICA
  // ════════════════════════════════════════════════════════════

  @Cron('0 3 * * *', { timeZone: 'America/Lima' })
  async cleanupExpired(): Promise<void> {
    const expiredCutoff = new Date();
    const hardCutoff = new Date(
      Date.now() - NOTIFICATION_HARD_TTL_DAYS * 86_400_000,
    );

    const expiredRes = await this.repo
      .createQueryBuilder()
      .delete()
      .where('expires_at IS NOT NULL AND expires_at <= :now', {
        now: expiredCutoff,
      })
      .execute();

    const hardRes = await this.repo.delete({
      createdAt: LessThan(hardCutoff),
    });

    this.logger.log(
      `notification_cleanup ttl=${expiredRes.affected ?? 0} hard=${hardRes.affected ?? 0}`,
    );
  }
}