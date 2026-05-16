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
  fixedDurationMin: number | null;
  maxDurationMin: number;
  slotMinutes: number;
  allowedDays: readonly DiaSemanaIso[];
  defaultHours: { start: string; end: string };
  label: string;
  requiresChild: boolean;
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
    fixedDurationMin: null,
    maxDurationMin: 180,
    slotMinutes: 30,
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
    slotMinutes: 45,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '15:30' },
    label: 'Docente',
    requiresChild: true,
    directBooking: false,
  },
  director: {
    role: 'director',
    fixedDurationMin: null,        // ← antes era 15 fijo; ahora flexible en bloques de 15
    maxDurationMin: 60,            // tope razonable; ajustá si querés más
    slotMinutes: 15,
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
    slotMinutes: 15,
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
    slotMinutes: 15,
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
    slotMinutes: 30,
    allowedDays: WEEK_FULL,
    defaultHours: { start: '08:00', end: '16:00' },
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
  if (rol === 'auxiliar') return 'auxiliar';
  if (rol === 'docente') return 'docente';
  if (rol === 'psicologa') return 'psicologa';
  if (rol === 'padre') return 'padre';
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
