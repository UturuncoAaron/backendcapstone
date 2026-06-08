import type { Rol } from '../auth/types/auth-user.js';
import type { AppointmentType } from './appointments.types.js';

export type DiaSemanaIso =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado';

export const ISO_WEEK_DAYS: readonly DiaSemanaIso[] = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
] as const;

/**
 * Macro-rol funcional dentro del flujo de citas.
 *
 * NOTA: `auxiliar` NO está incluido a propósito. El rol auxiliar es operativo
 * (solo asistencias) y no participa de citas/disponibilidad.
 */
export type AppointmentRole =
  | 'psicologa'
  | 'docente'
  | 'director'
  | 'admin'
  | 'padre';

export interface AppointmentRoleRule {
  role: AppointmentRole;
  fixedDurationMin: number | null;
  maxDurationMin: number;
  slotMinutes: number;
  /**
   * Máxima cantidad de slots consecutivos que puede ocupar una cita.
   * El BE valida `durationMin <= maxConsecutiveSlots * slotMinutes` cuando
   * `fixedDurationMin` es null (duración variable).
   */
  maxConsecutiveSlots: number;
  allowedDays: readonly DiaSemanaIso[];
  defaultHours: { start: string; end: string };
  /**
   * Hora límite de atención (HH:mm). Aunque el profesional declare
   * disponibilidad más allá de esta hora, el motor de slots la recorta
   * a este tope. `null` = sin tope adicional (solo aplica defaultHours).
   *
   * Spec (Aarón, 2026-05): docentes y administración/dirección atienden
   * estrictamente hasta las 15:30.
   */
  attentionEnd: string | null;
  label: string;
  requiresChild: boolean;
  directBooking: boolean;
}

/**
 * Tope global de slots consecutivos por cita: una cita puede ocupar 1
 * o 2 slots seguidos (cita simple o cita doble). Aplica a todos los
 * roles con `fixedDurationMin = null`.
 */
export const MAX_CONSECUTIVE_SLOTS = 2;

const WEEK_FULL: readonly DiaSemanaIso[] = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
] as const;

export const APPOINTMENT_RULES: Record<AppointmentRole, AppointmentRoleRule> = {
  psicologa: {
    role: 'psicologa',
    fixedDurationMin: null,
    // 2 slots consecutivos × 30 min = 60 min máx por cita.
    maxDurationMin: 60,
    slotMinutes: 30,
    maxConsecutiveSlots: MAX_CONSECUTIVE_SLOTS,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '16:00' },
    attentionEnd: null,
    label: 'Psicología',
    requiresChild: true,
    directBooking: true,
  },
  docente: {
    role: 'docente',
    // Spec (Aarón, 2026-05): los bloques de disponibilidad de 45 min se
    // dividen internamente en 3 sub-slots de 15 min. Cada cita ocupa un
    // único sub-slot de 15 min, permitiendo atender hasta 3 padres por
    // bloque de 45 min. La cita docente es, por tanto, de 15 min fijos.
    fixedDurationMin: 15,
    maxDurationMin: 15,
    slotMinutes: 15,
    maxConsecutiveSlots: 1,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '15:30' },
    attentionEnd: '15:30',
    label: 'Docente',
    requiresChild: true,
    directBooking: false,
  },
  director: {
    role: 'director',
    // Spec: slots absolutamente fijos e indivisibles de 15 min, un solo
    // padre por slot.
    fixedDurationMin: 15,
    maxDurationMin: 15,
    slotMinutes: 15,
    maxConsecutiveSlots: 1,
    allowedDays: ['martes', 'jueves'],
    defaultHours: { start: '08:00', end: '15:30' },
    attentionEnd: '15:30',
    label: 'Dirección',
    requiresChild: false,
    directBooking: false,
  },
  admin: {
    role: 'admin',
    // Spec: slots absolutamente fijos e indivisibles de 15 min, un solo
    // padre por slot.
    fixedDurationMin: 15,
    maxDurationMin: 15,
    slotMinutes: 15,
    maxConsecutiveSlots: 1,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '15:30' },
    attentionEnd: '15:30',
    label: 'Administración',
    requiresChild: false,
    directBooking: false,
  },
  padre: {
    role: 'padre',
    fixedDurationMin: null,
    maxDurationMin: 60,
    slotMinutes: 30,
    maxConsecutiveSlots: MAX_CONSECUTIVE_SLOTS,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '16:00' },
    attentionEnd: null,
    label: 'Padre / Tutor',
    requiresChild: false,
    directBooking: false,
  },
};
export function isDirectorCargo(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  return /director/i.test(cargo);
}
export function resolveAppointmentRole(
  rol: Rol,
  cargo: string | null | undefined,
): AppointmentRole {
  if (rol === 'admin' && isDirectorCargo(cargo)) return 'director';
  if (rol === 'admin') return 'admin';
  if (rol === 'docente') return 'docente';
  if (rol === 'psicologa') return 'psicologa';
  if (rol === 'padre') return 'padre';
  // 'auxiliar', 'alumno' → no participan como convocadores/convocados con
  // disponibilidad propia. El servicio debe filtrar antes de llegar acá.
  throw new Error(`Rol ${rol} no participa en el flujo de citas`);
}

export function getAppointmentRule(role: AppointmentRole): AppointmentRoleRule {
  return APPOINTMENT_RULES[role];
}
export function isDayAllowed(
  rule: AppointmentRoleRule,
  scheduledAt: Date,
): boolean {
  const dayIdx = scheduledAt.getDay();
  const map: Record<number, DiaSemanaIso | undefined> = {
    0: undefined,
    1: 'lunes',
    2: 'martes',
    3: 'miercoles',
    4: 'jueves',
    5: 'viernes',
    6: 'sabado',
  };
  const name = map[dayIdx];
  if (!name) return false;
  return rule.allowedDays.includes(name);
}

/** Texto legible para mensajes de error con la lista de días permitidos. */
export function formatAllowedDays(rule: AppointmentRoleRule): string {
  const labels: Record<DiaSemanaIso, string> = {
    lunes: 'lunes',
    martes: 'martes',
    miercoles: 'miércoles',
    jueves: 'jueves',
    viernes: 'viernes',
    sabado: 'sábado',
  };
  return rule.allowedDays.map((d) => labels[d]).join(' y ');
}

// ============================================================================
// MATRIZ DE INVITACIÓN — quién puede citar a quién
// ----------------------------------------------------------------------------
// Spec (Aarón, 2026-05):
//   docente  -> SOLO padre del alumno (alumno obligatorio)
//   psicologa-> alumno, padre, o ambos (autocompleta padre vía padre_alumno)
//   padre    -> psicologa o docente
//   alumno   -> SOLO psicologa
//   admin/director -> SOLO padre (alumno obligatorio)
//   auxiliar -> NO participa en citas (solo asistencias)
// ============================================================================

export type CallerRol = Rol;
export type RecipientRol = Rol;

/** Roles a los que cada rol que cita puede dirigir una cita. */
const INVITATION_MATRIX: Partial<Record<CallerRol, readonly RecipientRol[]>> = {
  docente: ['padre'],
  psicologa: ['alumno', 'padre'],
  // Spec (Aarón, 2026-06): el padre/tutor puede agendar con psicóloga,
  // docente y administración (admin incluye director / secretaría / cualquier
  // rol administrativo).
  padre: ['psicologa', 'docente', 'admin'],
  alumno: ['psicologa'],
  admin: ['padre'],
  // auxiliar: deliberadamente excluido — solo gestiona asistencias.
};

/** True si `caller` puede agendar una cita dirigida a un usuario con rol `recipient`. */
export function canInvite(caller: CallerRol, recipient: RecipientRol): boolean {
  return (INVITATION_MATRIX[caller] ?? []).includes(recipient);
}

/** Devuelve los roles permitidos para el destinatario según el rol del convocante. */
export function allowedRecipientsFor(
  caller: CallerRol,
): readonly RecipientRol[] {
  return INVITATION_MATRIX[caller] ?? [];
}

/** True si el rol que cita necesita SIEMPRE indicar `alumno_id` en la cita. */
export function callerRequiresStudent(caller: CallerRol): boolean {
  return caller === 'docente' || caller === 'padre';
}
/**
 * True si la cita debe usar la regla del CONVOCADOR para calcular
 * duración / slot. Aplica cuando el convocador tiene su propia
 * disponibilidad y duración (psicóloga, docente, admin/director).
 *
 * El convocado pasivo (padre, alumno) no impone duración: simplemente
 * acepta o rechaza la cita en el horario que el convocador propuso.
 */
export function callerOwnsSchedule(caller: CallerRol): boolean {
  return caller === 'psicologa' || caller === 'docente' || caller === 'admin';
}

// ============================================================================
// MATRIZ DE ESTADO INICIAL (Aarón, spec 2026-05)
// ----------------------------------------------------------------------------
// La cita se confirma automáticamente solo si:
//   • padre → psicóloga                                       (confirmada)
//   • alumno → psicóloga                                      (confirmada)
//   • psicóloga → alumno (sin padre vinculado a la cita)      (confirmada)
//
// Resto de combinaciones queda en `pendiente` esperando la confirmación
// del invitado (o del padre, en el caso psi → padre+alumno).
// ============================================================================
export type InitialStatus = 'confirmada' | 'pendiente';

export interface InitialStatusContext {
  caller: CallerRol;
  recipient: CallerRol;
  /** True si la cita lleva un alumno vinculado (psi → alumno [+ padre]). */
  hasStudent?: boolean;
  /** True si la cita lleva un padre vinculado además del invitado. */
  hasParent?: boolean;
}

export function resolveInitialStatus(ctx: InitialStatusContext): InitialStatus {
  const { caller, recipient } = ctx;

  // Alumno → psicóloga = confirmada (el alumno sólo puede agendar con psi,
  // se asume vínculo/confianza directa).
  if (caller === 'alumno' && recipient === 'psicologa') return 'confirmada';

  if (caller === 'padre' && recipient === 'psicologa') return 'confirmada';

  // Psicóloga → alumno: confirmada si NO hay padre vinculado; si el padre
  // también participa (cita mixta), queda pendiente hasta que el padre
  // confirme — la cita depende enteramente del padre.
  if (caller === 'psicologa' && recipient === 'alumno') {
    return ctx.hasParent ? 'pendiente' : 'confirmada';
  }

  // Cualquier otra combinación queda pendiente. En particular:
  //   • padre → docente / admin               (el profesional debe aceptar)
  //   • psicóloga → padre
  //   • docente → padre
  //   • admin / director → padre
  return 'pendiente';
}

// ============================================================================
// RECURRENCIA DE SEGUIMIENTO (Plan de Seguimiento Inteligente)
// ----------------------------------------------------------------------------
// Intervalo recomendado (en días) hasta la próxima sesión de seguimiento,
// según el `tipo` de la cita actual. El panel de cierre clínico propone por
// defecto `fecha_actual + intervalo` y la psicóloga puede ajustarla.
// ============================================================================
export const FOLLOW_UP_INTERVAL_DAYS: Record<AppointmentType, number> = {
  psicologico: 14,
  conductual: 14,
  familiar: 21,
  academico: 30,
  disciplinario: 7,
  otro: 14,
};

export function getFollowUpIntervalDays(tipo: AppointmentType): number {
  return FOLLOW_UP_INTERVAL_DAYS[tipo] ?? 14;
}
