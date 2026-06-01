import {
  IsUUID,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsString,
  MinLength,
  IsIn,
  Matches,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_STATUSES,
} from '../appointments.types.js';
import type {
  AppointmentType,
  AppointmentStatus,
} from '../appointments.types.js';
import { Type } from 'class-transformer';

export class CreateAppointmentDto {
  @IsUUID()
  convocadoAId: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsEnum(APPOINTMENT_TYPES)
  tipo: AppointmentType;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(180)
  durationMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  priorNotes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsEnum(APPOINTMENT_STATUSES)
  estado?: AppointmentStatus;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(180)
  durationMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpNotes?: string;

  @IsOptional()
  @IsUUID()
  rescheduledFromId?: string;
}

export class CancelAppointmentDto {
  // Spec (Aarón, 2026-05): el motivo de cancelación es OBLIGATORIO para
  // que ambas partes vean por qué se canceló la cita.
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo: string;
}

export class RejectAppointmentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo: string;
}

/** Cuerpo común a las acciones que exigen motivo (cancelar/rechazar/aplazar). */
export class MotivoDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo: string;
}

export class PostponeAppointmentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo: string;

  @IsDateString()
  nuevaFechaHora: string;
}

export class DeriveAppointmentDto {
  @IsUUID()
  alumnoId: string;

  @IsUUID()
  psicologaId: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(180)
  durationMin?: number;
}

export class CompleteAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notasPosteriores?: string;
}

const FICHA_CATEGORIES = [
  'conductual',
  'academico',
  'familiar',
  'emocional',
  'otro',
] as const;

/** Datos de la cita de seguimiento creada al cerrar la sesión. */
export class FollowUpScheduleDto {
  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(180)
  durationMin?: number;

  /** Si true, la cita de seguimiento incluye al padre → nacerá pendiente. */
  @IsOptional()
  @IsBoolean()
  incluirPadre?: boolean;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsEnum(APPOINTMENT_TYPES)
  tipo?: AppointmentType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

/**
 * Cierre clínico (Slide-over de Psicología): marca la cita actual como
 * realizada, guarda notas clínicas (ficha privada) y opcionalmente crea la
 * cita de seguimiento en una sola transacción.
 */
export class CloseSessionDto {
  /** Notas clínicas privadas → se guardan como ficha de psicología. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notasClinicas?: string;

  @IsOptional()
  @IsIn(FICHA_CATEGORIES)
  fichaCategoria?: (typeof FICHA_CATEGORIES)[number];

  /** Notas posteriores visibles en la cita (resumen administrativo). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notasPosteriores?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FollowUpScheduleDto)
  seguimiento?: FollowUpScheduleDto;
}

export class ListAppointmentsQueryDto {
  @IsOptional()
  @IsEnum(APPOINTMENT_STATUSES)
  estado?: AppointmentStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsIn(['DESC', 'ASC'])
  order?: 'DESC' | 'ASC';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SetAvailabilityDto {
  @IsIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'])
  diaSemana: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Formato de hora inválido, usa HH:mm' })
  horaInicio: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Formato de hora inválido, usa HH:mm' })
  horaFin: string;
}
export class ReplaceAvailabilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetAvailabilityDto)
  items: SetAvailabilityDto[];
}
