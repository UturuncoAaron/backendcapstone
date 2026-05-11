export const APPOINTMENT_TYPES = [
  'academico',
  'conductual',
  'psicologico',
  'familiar',
  'disciplinario',
  'otro',
] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_MODALITIES = ['presencial'] as const;
export type AppointmentModality = (typeof APPOINTMENT_MODALITIES)[number];

export const APPOINTMENT_STATUSES = [
  'pendiente',
  'confirmada',
  'realizada',
  'cancelada',
  'rechazada',
  'no_asistio',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

// Roles que pueden marcar su propia disponibilidad y, por lo tanto, agendar
// citas únicamente dentro de su calendario.
export const ROLES_WITH_AVAILABILITY = [
  'psicologa',
  'docente',
  'admin',
  'auxiliar',
] as const;
export type RoleWithAvailability = (typeof ROLES_WITH_AVAILABILITY)[number];

// Roles a los que un convocador puede dirigir una cita
export const APPOINTMENT_RECIPIENT_ROLES = [
  'psicologa',
  'docente',
  'padre',
  'alumno',
  'admin',
  'auxiliar',
] as const;
export type AppointmentRecipientRole =
  (typeof APPOINTMENT_RECIPIENT_ROLES)[number];

// Estados que el convocador puede setear vs el convocado
export const SELF_CANCELLABLE_STATES: AppointmentStatus[] = [
  'pendiente',
  'confirmada',
];
