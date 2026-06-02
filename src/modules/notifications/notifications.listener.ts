import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { NotificationsService } from './notifications.service.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { NOTIFICATION_EVENT_NAMES } from './events/notification-events.js';
import type {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
  AppointmentCancelledEvent,
  AnnouncementCreatedEvent,
  TaskCreatedEvent,
  StudentAbsentEvent,
  PeriodExpiredEvent,
} from './events/notification-events.js';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly service: NotificationsService,
    private readonly gateway: NotificationsGateway,
    private readonly dataSource: DataSource,
  ) { }

  // ── Citas ───────────────────────────────────────────────────────

  @OnEvent(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CREATED, { async: true })
  async onAppointmentCreated(ev: AppointmentCreatedEvent): Promise<void> {
    try {
      const when = ev.scheduledAt.toLocaleString('es-PE', {
        dateStyle: 'long',
        timeStyle: 'short',
      });

      const targets = new Set<string>([ev.convocadoAId]);
      if (ev.createdById !== ev.convocadoAId) targets.add(ev.createdById);
      if (
        ev.studentId &&
        ev.studentId !== ev.convocadoAId &&
        ev.studentId !== ev.createdById
      ) {
        targets.add(ev.studentId);
      }

      for (const accountId of targets) {
        const isRecipient = accountId === ev.convocadoAId;
        const isStudent = accountId === ev.studentId;
        const notif = await this.service.notify({
          accountId,
          tipo: 'cita_agendada',
          titulo: isRecipient
            ? 'Nueva cita agendada'
            : isStudent
              ? 'Se agendó una cita relacionada contigo'
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
      if (ev.nextStatus !== 'confirmada') return;

      for (const accountId of ev.notifyAccountIds) {
        if (accountId === ev.actorId) continue;
        const notif = await this.service.notify({
          accountId,
          tipo: 'cita_confirmada',
          titulo: 'Cita confirmada',
          cuerpo: 'La otra parte aceptó tu cita',
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

  @OnEvent(NOTIFICATION_EVENT_NAMES.STUDENT_ABSENT, { async: true })
  async onStudentAbsent(ev: StudentAbsentEvent): Promise<void> {
    try {
      if (ev.parentAccountIds.length === 0) return;

      const fechaStr = ev.fecha.toLocaleDateString('es-PE', {
        dateStyle: 'long',
      });
      const titulo = `${ev.alumnoNombre} no asistió hoy`;
      const cuerpo = ev.motivo
        ? `Fecha: ${fechaStr} — Justificación: ${ev.motivo}`
        : `Fecha: ${fechaStr} — Sin justificación`;

      const created = await this.service.notifyBulk({
        accountIds: ev.parentAccountIds,
        tipo: 'inasistencia_alumno',
        titulo,
        cuerpo,
        referenceId: ev.alumnoId,
        referenceType: 'alumno',
      });

      for (const notif of created) {
        this.gateway.pushNotification(notif.accountId, notif);
      }
    } catch (err) {
      this.logger.error('Error al notificar student.absent', err as Error);
    }
  }

  // ── Periodo vencido ─────────────────────────────────────────────

  /**
   * Notifica a todos los admins que un periodo terminó y el siguiente
   * debe activarse manualmente. Un clic desde la campana lleva directo
   * a /academico/periodos.
   */
  @OnEvent(NOTIFICATION_EVENT_NAMES.PERIOD_EXPIRED, { async: true })
  async onPeriodExpired(ev: PeriodExpiredEvent): Promise<void> {
    try {
      if (ev.adminAccountIds.length === 0) return;

      const created = await this.service.notifyBulk({
        accountIds: ev.adminAccountIds,
        tipo: 'periodo_vencido',
        titulo: `El ${ev.periodoNombre} ha terminado`,
        cuerpo: `El ${ev.bimestre}° bimestre ${ev.anio} ya venció. Activa el siguiente periodo cuando corresponda.`,
        referenceId: ev.periodoId,
        referenceType: 'periodo',
      });

      for (const notif of created) {
        this.gateway.pushNotification(notif.accountId, notif);
      }

      this.logger.log(
        `period_expired_notified periodoId=${ev.periodoId} admins=${ev.adminAccountIds.length}`,
      );
    } catch (err) {
      this.logger.error('Error al notificar period.expired', err as Error);
    }
  }
}