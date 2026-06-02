export const NOTIFICATION_EVENT_NAMES = {
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_STATUS_CHANGED: 'appointment.status_changed',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  ANNOUNCEMENT_CREATED: 'announcement.created',
  TASK_CREATED: 'task.created',
  STUDENT_ABSENT: 'student.absent',
  PERIOD_EXPIRED: 'period.expired',
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
  convocadoARole: string;
}

export interface AppointmentStatusChangedEvent {
  appointmentId: string;
  actorId: string;
  previousStatus: string;
  nextStatus: string;
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
  destinatarios: string[];
  createdById: string;
}

export interface TaskCreatedEvent {
  taskId: string;
  cursoId: string;
  titulo: string;
  alumnoIds: string[];
  fechaLimite: Date | null;
}

export interface StudentAbsentEvent {
  alumnoId: string;
  alumnoNombre: string;
  fecha: Date;
  parentAccountIds: string[];
  motivo: string | null;
}
export interface PeriodExpiredEvent {
  periodoId: string;
  periodoNombre: string;
  anio: number;
  bimestre: number;
  adminAccountIds: string[];
}