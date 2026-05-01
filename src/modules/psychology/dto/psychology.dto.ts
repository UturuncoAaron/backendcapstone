import {
    IsString, IsUUID, IsOptional,
    IsEnum, IsDateString, IsInt, Min, Max, Length,
} from 'class-validator';

// ── Psychology records ────────────────────────────────────────────────────────

export class CreateRecordDto {
    @IsUUID()
    studentId: string;

    @IsEnum(['conductual', 'academico', 'familiar', 'emocional', 'otro'])
    categoria: string;

    @IsString()
    contenido: string;
}

export class UpdateRecordDto {
    @IsOptional()
    @IsEnum(['conductual', 'academico', 'familiar', 'emocional', 'otro'])
    categoria?: string;

    @IsOptional()
    @IsString()
    contenido?: string;
}

// ── Appointments ──────────────────────────────────────────────────────────────

export class CreateAppointmentDto {
    @IsUUID()
    parentId: string;

    @IsUUID()
    studentId: string;

    @IsEnum(['academico', 'conductual', 'psicologico', 'familiar', 'otro'])
    tipo: string;

    @IsEnum(['presencial', 'virtual', 'telefonico'])
    modalidad: string;

    @IsString()
    motivo: string;

    @IsDateString()
    scheduledAt: string;

    @IsOptional()
    @IsInt()
    @Min(15)
    @Max(120)
    durationMin?: number;

    @IsOptional()
    @IsString()
    priorNotes?: string;
}

export class UpdateAppointmentDto {
    @IsOptional()
    @IsEnum(['pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio'])
    estado?: string;

    @IsOptional()
    @IsDateString()
    scheduledAt?: string;

    @IsOptional()
    @IsEnum(['presencial', 'virtual', 'telefonico'])
    modalidad?: string;

    @IsOptional()
    @IsString()
    followUpNotes?: string;

    @IsOptional()
    @IsUUID()
    rescheduledFromId?: string;
}

// ── Availability ──────────────────────────────────────────────────────────────

export class CreateAvailabilityDto {
    @IsEnum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes'])
    weekDay: string;

    @IsString()
    startTime: string;

    @IsString()
    endTime: string;
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export class CreateBlockDto {
    @IsDateString()
    startDate: string;

    @IsDateString()
    endDate: string;

    @IsOptional()
    @IsString()
    @Length(1, 200)
    motivo?: string;
}