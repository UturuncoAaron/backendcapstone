export const APPOINTMENT_TYPES = [
    'academico', 'conductual', 'psicologico', 'familiar', 'disciplinario', 'otro',
] as const;
export type AppointmentType = typeof APPOINTMENT_TYPES[number];
 
export const APPOINTMENT_MODALITIES = ['presencial', 'virtual', 'telefonico'] as const;
export type AppointmentModality = typeof APPOINTMENT_MODALITIES[number];
 
export const APPOINTMENT_STATUSES = [
    'pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio',
] as const;
export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number];
 
// Roles a los que un convocador puede dirigir una cita
export const APPOINTMENT_RECIPIENT_ROLES = [
    'psicologa', 'docente', 'padre', 'admin', 'auxiliar',
] as const;
export type AppointmentRecipientRole = typeof APPOINTMENT_RECIPIENT_ROLES[number];
 
// Estados que el convocador puede setear vs el convocado
export const SELF_CANCELLABLE_STATES: AppointmentStatus[] = ['pendiente', 'confirmada'];