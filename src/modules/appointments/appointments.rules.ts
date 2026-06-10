import type { Rol } from '../auth/types/auth-user.js';
import type { AppointmentType } from './appointments.types.js';

export type DiaSemanaIso =
  | 'lunes' | 'martes' | 'miercoles'
  | 'jueves' | 'viernes' | 'sabado';

export const ISO_WEEK_DAYS: readonly DiaSemanaIso[] = [
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
] as const;

export type AppointmentRole =
  | 'psicologa' | 'docente' | 'director' | 'admin' | 'padre';

export interface AppointmentRoleRule {
  role: AppointmentRole;
  fixedDurationMin: number | null;
  maxDurationMin: number;
  slotMinutes: number;
  maxConsecutiveSlots: number;
  allowedDays: readonly DiaSemanaIso[];
  defaultHours: { start: string; end: string };
  attentionEnd: string | null;
  label: string;
  requiresChild: boolean;
  directBooking: boolean;
}

export const MAX_CONSECUTIVE_SLOTS = 2;

const WEEK_FULL: readonly DiaSemanaIso[] = [
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes',
] as const;

export const APPOINTMENT_RULES: Record<AppointmentRole, AppointmentRoleRule> = {
  psicologa: {
    role: 'psicologa',
    fixedDurationMin: null,
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

/** True si el cargo corresponde a un director. */
export function isDirectorCargo(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  return /director/i.test(cargo);
}

/** Resuelve el rol funcional de citas según rol de sistema y cargo. */
export function resolveAppointmentRole(
  rol: Rol,
  cargo: string | null | undefined,
): AppointmentRole {
  if (rol === 'admin' && isDirectorCargo(cargo)) return 'director';
  if (rol === 'admin') return 'admin';
  if (rol === 'docente') return 'docente';
  if (rol === 'psicologa') return 'psicologa';
  if (rol === 'padre') return 'padre';
  throw new Error(`Rol ${rol} no participa en el flujo de citas`);
}

/** Devuelve la regla de duración y slots para un rol funcional. */
export function getAppointmentRule(role: AppointmentRole): AppointmentRoleRule {
  return APPOINTMENT_RULES[role];
}

/** True si el día de la fecha está dentro de los días permitidos por la regla. */
export function isDayAllowed(rule: AppointmentRoleRule, scheduledAt: Date): boolean {
  const dayIdx = scheduledAt.getDay();
  const map: Record<number, DiaSemanaIso | undefined> = {
    0: undefined, 1: 'lunes', 2: 'martes', 3: 'miercoles',
    4: 'jueves', 5: 'viernes', 6: 'sabado',
  };
  const name = map[dayIdx];
  if (!name) return false;
  return rule.allowedDays.includes(name);
}

/** Devuelve los días permitidos como texto legible para mensajes de error. */
export function formatAllowedDays(rule: AppointmentRoleRule): string {
  const labels: Record<DiaSemanaIso, string> = {
    lunes: 'lunes', martes: 'martes', miercoles: 'miércoles',
    jueves: 'jueves', viernes: 'viernes', sabado: 'sábado',
  };
  return rule.allowedDays.map((d) => labels[d]).join(' y ');
}

export type CallerRol = Rol;
export type RecipientRol = Rol;

const INVITATION_MATRIX: Partial<Record<CallerRol, readonly RecipientRol[]>> = {
  docente: ['padre'],
  psicologa: ['alumno', 'padre'],
  padre: ['psicologa', 'docente', 'admin'],
  alumno: ['psicologa'],
  admin: ['padre'],
};

/** True si el caller puede convocar a una cuenta con el rol recipient. */
export function canInvite(caller: CallerRol, recipient: RecipientRol): boolean {
  return (INVITATION_MATRIX[caller] ?? []).includes(recipient);
}

/** Devuelve los roles a los que el caller puede dirigir una cita. */
export function allowedRecipientsFor(caller: CallerRol): readonly RecipientRol[] {
  return INVITATION_MATRIX[caller] ?? [];
}

/** True si el rol que cita debe indicar siempre un alumno. */
export function callerRequiresStudent(caller: CallerRol): boolean {
  return caller === 'docente' || caller === 'padre';
}

/** True si el convocador es dueño del calendario y define duración/slot. */
export function callerOwnsSchedule(caller: CallerRol): boolean {
  return caller === 'psicologa' || caller === 'docente' || caller === 'admin';
}

export type InitialStatus = 'confirmada' | 'pendiente';

export interface InitialStatusContext {
  caller: CallerRol;
  recipient: CallerRol;
  hasStudent?: boolean;
  hasParent?: boolean;
}

/**
 * Resuelve el estado inicial de una cita según quién convoca a quién.
 *
 * Reglas:
 *   padre   → psicologa / docente / admin  = confirmada (eligió slot en disponibilidad)
 *   alumno  → psicologa                    = confirmada
 *   psicologa → alumno                     = confirmada
 *   resto                                  = pendiente
 */
export function resolveInitialStatus(ctx: InitialStatusContext): InitialStatus {
  const { caller, recipient } = ctx;

  if (caller === 'padre') return 'confirmada';

  if (caller === 'alumno' && recipient === 'psicologa') return 'confirmada';

  if (caller === 'psicologa' && recipient === 'alumno') return 'confirmada';

  return 'pendiente';
}

export const FOLLOW_UP_INTERVAL_DAYS: Record<AppointmentType, number> = {
  psicologico: 14,
  conductual: 14,
  familiar: 21,
  academico: 30,
  disciplinario: 7,
  otro: 14,
};

/** Devuelve el intervalo de seguimiento en días según el tipo de cita. */
export function getFollowUpIntervalDays(tipo: AppointmentType): number {
  return FOLLOW_UP_INTERVAL_DAYS[tipo] ?? 14;
}