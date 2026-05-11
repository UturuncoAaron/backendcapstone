import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  ) {}

  // ════════════════════════════════════════════════════════════
  // CREAR — usado por el listener de eventos
  // ════════════════════════════════════════════════════════════

  async notify(dto: CreateNotificationDto): Promise<Notification> {
    const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_DAYS * 86_400_000);
    const notification = this.repo.create({ ...dto, expiresAt });
    return this.repo.save(notification);
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
    return this.repo.save(notifications);
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
    return this.repo.count({
      where: { accountId, read: false },
    });
  }

  // ════════════════════════════════════════════════════════════
  // MARCAR COMO LEÍDA
  // ════════════════════════════════════════════════════════════

  async markOneAsRead(id: string, accountId: string): Promise<void> {
    await this.repo.update({ id, accountId }, { read: true });
  }

  async markAllAsRead(accountId: string): Promise<void> {
    await this.repo.update({ accountId, read: false }, { read: true });
  }

  // ════════════════════════════════════════════════════════════
  // LIMPIEZA AUTOMÁTICA
  // ════════════════════════════════════════════════════════════

  /**
   * Job diario que elimina:
   *  1. Las notificaciones cuyo `expires_at` ya pasó (14 días — set por trigger).
   *  2. Las que tengan más de 30 días aunque no estén leídas (límite duro).
   *
   * Se ejecuta a las 03:00 (hora del proceso) — fuera de pico de uso del
   * colegio. El hard TTL protege contra crecimiento descontrolado si el
   * trigger del schema fallara.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
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
      `Notificaciones limpiadas: por TTL=${expiredRes.affected ?? 0}, por hard-TTL=${hardRes.affected ?? 0}`,
    );
  }
}
