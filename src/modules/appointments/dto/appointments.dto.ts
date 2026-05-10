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
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
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