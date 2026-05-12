/**
 * Reglas de citas por rol/cargo (single source of truth).
 *
 * El módulo de citas, el FE (vía `GET /appointments/rules`) y los tests
 * consultan este archivo para saber:
 *
 *  - Quién puede convocar a quién.
 *  - Qué duración debe tener una cita según el rol convocado.
 *  - Qué días de la semana atiende cada rol.
 *  - Qué franja horaria por defecto aplica cuando el profesional aún
 *    no declaró su propia disponibilidad.
 *
 * Las reglas vienen del directorio del colegio:
 *
 *  - Psicología       → cita directa, 30 min, L–V 08:00–16:00.
 *  - Docente          → 45 min, L–V según su horario de atención
 *                       (jornada laboral 08:00–15:30).
 *  - Director         → 15 min máx, sólo martes y jueves, 08:00–15:30.
 *  - Auxiliar / admin → sin restricción especial, usan su disponibilidad.
 *
 * Mantener este archivo sincronizado con
 * `eduaula/src/app/core/models/appointment-rules.ts` (FE).
 */

import type { Rol } from '../auth/types/auth-user.js';

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

/** Macro-rol funcional dentro del flujo de citas. */
export type AppointmentRole =
  | 'psicologa'
  | 'docente'
  | 'director'
  | 'admin'
  | 'auxiliar'
  | 'padre';

export interface AppointmentRoleRule {
  role: AppointmentRole;
  /** Duración fija para este rol (min). null = elegida por el convocador. */
  fixedDurationMin: number | null;
  /** Duración máxima permitida (min). */
  maxDurationMin: number;
  /** Días de la semana en los que el rol atiende. */
  allowedDays: readonly DiaSemanaIso[];
  /** Franja horaria por defecto (HH:mm – HH:mm) si no hay disponibilidad propia. */
  defaultHours: { start: string; end: string };
  /** Rol "etiqueta" que se muestra al usuario y se devuelve por la API. */
  label: string;
  /**
   * Reglas extra que el FE quiere conocer (ej.: padres deben elegir un
   * hijo antes de pedir cita con psicología).
   */
  requiresChild: boolean;
  /** True si el flujo es "cita directa" (sin doble confirmación). */
  directBooking: boolean;
}

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
    fixedDurationMin: 30,
    maxDurationMin: 30,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '16:00' },
    label: 'Psicología',
    requiresChild: true,
    directBooking: true,
  },
  docente: {
    role: 'docente',
    fixedDurationMin: 45,
    maxDurationMin: 45,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '15:30' },
    label: 'Docente',
    requiresChild: true,
    directBooking: false,
  },
  director: {
    role: 'director',
    fixedDurationMin: 15,
    maxDurationMin: 15,
    allowedDays: ['martes', 'jueves'],
    defaultHours: { start: '08:00', end: '15:30' },
    label: 'Dirección',
    requiresChild: false,
    directBooking: false,
  },
  admin: {
    role: 'admin',
    fixedDurationMin: null,
    maxDurationMin: 60,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '15:30' },
    label: 'Administración',
    requiresChild: false,
    directBooking: false,
  },
  auxiliar: {
    role: 'auxiliar',
    fixedDurationMin: null,
    maxDurationMin: 60,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '15:30' },
    label: 'Auxiliar',
    requiresChild: false,
    directBooking: false,
  },
  padre: {
    role: 'padre',
    fixedDurationMin: null,
    maxDurationMin: 60,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '16:00' },
    label: 'Padre / Tutor',
    requiresChild: false,
    directBooking: false,
  },
};

/**
 * Detecta si un admin actúa como director, a partir de su `cargo`. La cadena
 * proviene de la tabla `admins.cargo` y puede llegar como "Director",
 * "Directora", "DIRECTORA GENERAL", etc.
 */
export function isDirectorCargo(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  return /director/i.test(cargo);
}

/**
 * Devuelve la regla aplicable para un rol del backend, considerando si el
 * admin es director.
 */
export function resolveAppointmentRole(
  rol: Rol,
  cargo: string | null | undefined,
): AppointmentRole {
  if (rol === 'admin' && isDirectorCargo(cargo)) return 'director';
  if (rol === 'admin') return 'admin';
  if (rol === 'auxiliar') return 'auxiliar';
  if (rol === 'docente') return 'docente';
  if (rol === 'psicologa') return 'psicologa';
  if (rol === 'padre') return 'padre';
  // alumno y otros roles fuera del flujo no tienen reglas — el caller
  // valida con `assertCanBeRecipient` / `assertCanCreate` antes.
  throw new Error(`Rol ${rol} no participa en el flujo de citas`);
}

export function getAppointmentRule(role: AppointmentRole): AppointmentRoleRule {
  return APPOINTMENT_RULES[role];
}

/**
 * True si la fecha cae en un día permitido para la regla. La fecha se
 * interpreta en zona horaria local del proceso (igual que el resto del
 * módulo de citas).
 */
export function isDayAllowed(
  rule: AppointmentRoleRule,
  scheduledAt: Date,
): boolean {
  const dayIdx = scheduledAt.getDay(); // 0=dom ... 6=sab
  // ISO_WEEK_DAYS[0] = lunes ... [5] = sabado; getDay 0=dom, 1=lun
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
