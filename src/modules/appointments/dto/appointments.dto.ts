import {
    IsUUID, IsOptional, IsEnum, IsDateString,
    IsInt, Min, Max, MaxLength, IsString, MinLength, IsIn,
} from 'class-validator';
import {
    APPOINTMENT_TYPES, APPOINTMENT_MODALITIES, APPOINTMENT_STATUSES,
} from '../appointments.types.js';
import type {
    AppointmentType, AppointmentModality, AppointmentStatus,
} from '../appointments.types.js';
export class CreateAppointmentDto {
    /** Cuenta destino (psicóloga, docente, padre, etc). El convocador = req.user. */
    @IsUUID()
    convocadoAId: string;
 
    /** Alumno sobre el que trata la cita (siempre presente — el contexto escolar). */
    @IsUUID()
    studentId: string;
 
    /** Padre involucrado (opcional, si no es ninguno de los dos convocados). */
    @IsOptional()
    @IsUUID()
    parentId?: string;
 
    @IsEnum(APPOINTMENT_TYPES)
    tipo: AppointmentType;
 
    @IsOptional()
    @IsEnum(APPOINTMENT_MODALITIES)
    modalidad?: AppointmentModality;
 
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
    @IsEnum(APPOINTMENT_MODALITIES)
    modalidad?: AppointmentModality;
 
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
    reason?: string;
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