import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Notification } from './entities/notification.entity.js';
import {
  CreateNotificationDto,
  CreateBulkNotificationDto,
} from './dto/notification.dto.js';

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

  /**
   * Contador de no leídas — filtra expiradas para mantener consistencia
   * con `getMyNotifications` (el badge nunca debe mostrar más que el listado).
   */
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
  // LIMPIEZA AUTOMÁTICA
  // ════════════════════════════════════════════════════════════

  /**
   * Job diario que elimina:
   *  1. Las notificaciones cuyo `expires_at` ya pasó (14 días, set por trigger).
   *  2. Las que tengan más de 30 días aunque no estén leídas (límite duro).
   *
   * Corre a las 03:00 hora Perú — fuera de pico de uso del colegio. El
   * hard TTL protege contra crecimiento descontrolado si el trigger del
   * schema fallara.
   */
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