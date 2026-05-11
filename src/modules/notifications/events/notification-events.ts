/**
 * Constantes de eventos del bus interno.
 *
 * El flujo es:
 *
 *   appointments.service ──emit──> 'appointment.created' ─┐
 *   announcements.service ──emit──> 'announcement.created'├──> NotificationsListener
 *   tasks.service        ──emit──> 'task.created'         ┘     └─> crea Notification + SSE push
 *
 * De esta forma:
 *
 *  - Los módulos emisores NO importan NotificationsService.
 *  - Para agregar una nueva fuente de notificaciones basta con emitir un
 *    evento nuevo y agregar un handler en el listener.
 *  - Si en el futuro se mueve a una cola (BullMQ, Redis Streams, etc.) el
 *    contrato del evento sigue siendo el mismo.
 *
 * Mantener sincronizado con el FE
 * (`eduaula/src/app/core/models/notifications.ts`).
 */

export const NOTIFICATION_EVENT_NAMES = {
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_STATUS_CHANGED: 'appointment.status_changed',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  ANNOUNCEMENT_CREATED: 'announcement.created',
  TASK_CREATED: 'task.created',
} as const;

export type NotificationEventName =
  (typeof NOTIFICATION_EVENT_NAMES)[keyof typeof NOTIFICATION_EVENT_NAMES];

// ── Payloads ────────────────────────────────────────────────────────

export interface AppointmentCreatedEvent {
  appointmentId: string;
  createdById: string;
  convocadoAId: string;
  parentId: string | null;
  studentId: string | null;
  scheduledAt: Date;
  motivo: string;
  /** Rol del convocado para mostrar etiqueta en el FE. */
  convocadoARole: string;
}

export interface AppointmentStatusChangedEvent {
  appointmentId: string;
  actorId: string;
  previousStatus: string;
  nextStatus: string;
  /** Cuentas a las que se debe notificar (creador + convocado + padre). */
  notifyAccountIds: string[];
}

export interface AppointmentCancelledEvent {
  appointmentId: string;
  actorId: string;
  reason: string | null;
  notifyAccountIds: string[];
}

export interface AnnouncementCreatedEvent {
  announcementId: string;
  titulo: string;
  contenido: string;
  /** Roles destino del comunicado (`todos | alumnos | docentes | padres | psicologas`). */
  destinatarios: string[];
  createdById: string;
}

export interface TaskCreatedEvent {
  taskId: string;
  cursoId: string;
  titulo: string;
  /** UUIDs de alumnos matriculados en el curso (se calcula al emitir). */
  alumnoIds: string[];
  fechaLimite: Date | null;
}
