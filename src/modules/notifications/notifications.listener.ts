import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { NOTIFICATION_EVENT_NAMES } from './events/notification-events.js';
import type {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
  AppointmentCancelledEvent,
  AnnouncementCreatedEvent,
  TaskCreatedEvent,
} from './events/notification-events.js';
import { DataSource } from 'typeorm';

/**
 * Listener único que materializa los eventos de dominio en notificaciones
 * persistidas y los empuja por SSE.
 *
 * Diseño:
 *  - Cada `@OnEvent` es chico, expresivo y maneja UN tipo de evento.
 *  - Si la creación de la notificación falla (DB caída, etc.) se loguea
 *    pero no rompe el flujo del emisor (event-emitter es async).
 *  - El gateway hace push best-effort: si el usuario no está conectado,
 *    leerá la notificación la próxima vez que abra la app.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly service: NotificationsService,
    private readonly gateway: NotificationsGateway,
    private readonly dataSource: DataSource,
  ) {}

  // ── Citas ───────────────────────────────────────────────────────

  @OnEvent(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CREATED, { async: true })
  async onAppointmentCreated(ev: AppointmentCreatedEvent): Promise<void> {
    try {
      const when = ev.scheduledAt.toLocaleString('es-PE', {
        dateStyle: 'long',
        timeStyle: 'short',
      });

      // Notificar al convocado siempre.
      const targets = new Set<string>([ev.convocadoAId]);
      // El convocador también recibe acuse para tener el ítem en su campana.
      if (ev.createdById !== ev.convocadoAId) targets.add(ev.createdById);

      for (const accountId of targets) {
        const isRecipient = accountId === ev.convocadoAId;
        const notif = await this.service.notify({
          accountId,
          tipo: 'cita_agendada',
          titulo: isRecipient
            ? 'Nueva cita agendada'
            : 'Cita agendada correctamente',
          cuerpo: `${when} — ${ev.motivo.slice(0, 140)}`,
          referenceId: ev.appointmentId,
          referenceType: 'cita',
        });
        this.gateway.pushNotification(accountId, notif);
      }
    } catch (err) {
      this.logger.error('Error al notificar appointment.created', err as Error);
    }
  }

  @OnEvent(NOTIFICATION_EVENT_NAMES.APPOINTMENT_STATUS_CHANGED, { async: true })
  async onAppointmentStatusChanged(
    ev: AppointmentStatusChangedEvent,
  ): Promise<void> {
    try {
      const tipo =
        ev.nextStatus === 'confirmada' ? 'cita_confirmada' : 'cita_agendada';
      for (const accountId of ev.notifyAccountIds) {
        if (accountId === ev.actorId) continue; // no notificar al que hizo el cambio
        const notif = await this.service.notify({
          accountId,
          tipo,
          titulo: `Cita ${ev.nextStatus}`,
          cuerpo: `El estado de tu cita cambió a "${ev.nextStatus}"`,
          referenceId: ev.appointmentId,
          referenceType: 'cita',
        });
        this.gateway.pushNotification(accountId, notif);
      }
    } catch (err) {
      this.logger.error(
        'Error al notificar appointment.status_changed',
        err as Error,
      );
    }
  }

  @OnEvent(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CANCELLED, { async: true })
  async onAppointmentCancelled(ev: AppointmentCancelledEvent): Promise<void> {
    try {
      for (const accountId of ev.notifyAccountIds) {
        if (accountId === ev.actorId) continue;
        const notif = await this.service.notify({
          accountId,
          tipo: 'cita_cancelada',
          titulo: 'Cita cancelada',
          cuerpo: ev.reason ?? 'La cita fue cancelada',
          referenceId: ev.appointmentId,
          referenceType: 'cita',
        });
        this.gateway.pushNotification(accountId, notif);
      }
    } catch (err) {
      this.logger.error(
        'Error al notificar appointment.cancelled',
        err as Error,
      );
    }
  }

  // ── Comunicados ─────────────────────────────────────────────────

  @OnEvent(NOTIFICATION_EVENT_NAMES.ANNOUNCEMENT_CREATED, { async: true })
  async onAnnouncementCreated(ev: AnnouncementCreatedEvent): Promise<void> {
    try {
      const accountIds = await this.resolveAnnouncementTargets(
        ev.destinatarios,
      );
      if (accountIds.length === 0) return;

      // Bulk insert + SSE push usando las notificaciones reales (con
      // sus IDs persistidos para que el FE pueda marcarlas como leídas).
      const created = await this.service.notifyBulk({
        accountIds,
        tipo: 'comunicado_nuevo',
        titulo: ev.titulo,
        cuerpo: ev.contenido.slice(0, 280),
        referenceId: ev.announcementId,
        referenceType: 'comunicado',
      });

      for (const notif of created) {
        this.gateway.pushNotification(notif.accountId, notif);
      }
    } catch (err) {
      this.logger.error(
        'Error al notificar announcement.created',
        err as Error,
      );
    }
  }

  /**
   * Traduce los roles destino (`'todos' | 'alumnos' | 'docentes' | ...`)
   * a UUIDs de cuentas activas.
   */
  private async resolveAnnouncementTargets(
    destinatarios: string[],
  ): Promise<string[]> {
    const wantsAll = destinatarios.includes('todos');
    const rolesMap: Record<string, string> = {
      alumnos: 'alumno',
      docentes: 'docente',
      padres: 'padre',
      psicologas: 'psicologa',
      auxiliares: 'auxiliar',
      admins: 'admin',
    };

    const wantedRoles = wantsAll
      ? Object.values(rolesMap)
      : destinatarios.map((d) => rolesMap[d]).filter((r): r is string => !!r);

    if (wantedRoles.length === 0) return [];

    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM cuentas WHERE activo = TRUE AND rol = ANY($1::text[])`,
      [wantedRoles],
    );
    return rows.map((r) => r.id);
  }

  // ── Tareas ──────────────────────────────────────────────────────

  @OnEvent(NOTIFICATION_EVENT_NAMES.TASK_CREATED, { async: true })
  async onTaskCreated(ev: TaskCreatedEvent): Promise<void> {
    try {
      if (ev.alumnoIds.length === 0) return;
      const cuerpo = ev.fechaLimite
        ? `Vence: ${ev.fechaLimite.toLocaleDateString('es-PE', { dateStyle: 'long' })}`
        : 'Revisa los detalles en tu curso';

      const created = await this.service.notifyBulk({
        accountIds: ev.alumnoIds,
        tipo: 'tarea_nueva',
        titulo: `Nueva tarea: ${ev.titulo}`,
        cuerpo,
        referenceId: ev.taskId,
        referenceType: 'tarea',
      });

      for (const notif of created) {
        this.gateway.pushNotification(notif.accountId, notif);
      }
    } catch (err) {
      this.logger.error('Error al notificar task.created', err as Error);
    }
  }
}
