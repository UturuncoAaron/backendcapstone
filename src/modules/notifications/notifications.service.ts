import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import { CreateNotificationDto, CreateBulkNotificationDto } from './dto/notification.dto.js';

@Injectable()
export class NotificationsService {

    constructor(
        @InjectRepository(Notification)
        private readonly repo: Repository<Notification>,
    ) { }

    // ════════════════════════════════════════════════════════════
    // CREAR — usado internamente por otros módulos
    // ════════════════════════════════════════════════════════════

    async notify(dto: CreateNotificationDto): Promise<Notification> {
        const notification = this.repo.create(dto);
        return this.repo.save(notification);
    }

    // Notificar a múltiples cuentas a la vez (ej: comunicado a todos los padres)
    async notifyBulk(dto: CreateBulkNotificationDto): Promise<void> {
        const notifications = dto.accountIds.map(accountId =>
            this.repo.create({
                accountId,
                tipo: dto.tipo,
                titulo: dto.titulo,
                cuerpo: dto.cuerpo,
                referenceId: dto.referenceId,
                referenceType: dto.referenceType,
            }),
        );
        await this.repo.save(notifications);
    }

    // ════════════════════════════════════════════════════════════
    // LEER — endpoints para el usuario
    // ════════════════════════════════════════════════════════════

    async getMyNotifications(accountId: string, onlyUnread = false): Promise<Notification[]> {
        return this.repo.find({
            where: {
                accountId,
                ...(onlyUnread ? { read: false } : {}),
            },
            order: { createdAt: 'DESC' },
            take: 50,
        });
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
    // LIMPIEZA — job periódico (llamar desde un cron mensual)
    // ════════════════════════════════════════════════════════════

    async deleteOldNotifications(olderThanDays = 90): Promise<void> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - olderThanDays);
        await this.repo.delete({ read: true, createdAt: LessThan(cutoff) });
    }

    // ════════════════════════════════════════════════════════════
    // HELPERS — usados por otros módulos al exportar el service
    // ════════════════════════════════════════════════════════════

    // Notificar cita agendada al padre
    async notifyAppointmentScheduled(parentId: string, appointmentId: string, detail: string): Promise<void> {
        await this.notify({
            accountId: parentId,
            tipo: 'cita_agendada',
            titulo: 'Tienes una cita agendada',
            cuerpo: detail,
            referenceId: appointmentId,
            referenceType: 'cita',
        });
    }

    // Notificar mensaje nuevo
    async notifyNewMessage(accountId: string, conversationId: string, senderName: string): Promise<void> {
        await this.notify({
            accountId,
            tipo: 'mensaje_nuevo',
            titulo: `Nuevo mensaje de ${senderName}`,
            referenceId: conversationId,
            referenceType: 'mensaje',
        });
    }

    // Notificar libreta disponible
    async notifyLibretaAvailable(accountId: string, libretaId: string, period: string): Promise<void> {
        await this.notify({
            accountId,
            tipo: 'libreta_disponible',
            titulo: 'Tu libreta está disponible',
            cuerpo: `Ya puedes ver tu libreta del ${period}`,
            referenceId: libretaId,
            referenceType: 'libreta',
        });
    }

    // Notificar contrato por vencer (para admin)
    async notifyContractExpiring(adminId: string, teacherName: string, daysLeft: number): Promise<void> {
        await this.notify({
            accountId: adminId,
            tipo: 'contrato_por_vencer',
            titulo: 'Contrato por vencer',
            cuerpo: `El contrato de ${teacherName} vence en ${daysLeft} días`,
            referenceType: 'docente',
        });
    }
}