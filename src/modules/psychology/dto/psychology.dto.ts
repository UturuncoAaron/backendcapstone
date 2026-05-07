import {
    IsString, IsUUID, IsOptional, IsEnum, IsDateString,
    Length, Matches, IsInt, Min, Max,
} from 'class-validator';
import { RECORD_CATEGORIES, WEEK_DAYS } from '../psychology.types.js';
import type { RecordCategory, WeekDay } from '../psychology.types.js';
 
// ── Fichas ───────────────────────────────────────────────────────────────────
 
export class CreateRecordDto {
    @IsUUID()
    studentId: string;
 
    @IsEnum(RECORD_CATEGORIES)
    categoria: RecordCategory;
 
    @IsString()
    @Length(1, 10000)
    contenido: string;
}
 
export class UpdateRecordDto {
    @IsOptional()
    @IsEnum(RECORD_CATEGORIES)
    categoria?: RecordCategory;
 
    @IsOptional()
    @IsString()
    @Length(1, 10000)
    contenido?: string;
}
 
// ── Disponibilidad ──────────────────────────────────────────────────────────
 
export class CreateAvailabilityDto {
    @IsEnum(WEEK_DAYS)
    weekDay: WeekDay;
 
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime debe ser HH:mm' })
    startTime: string;
 
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime debe ser HH:mm' })
    endTime: string;
}
 
// ── Bloqueos ────────────────────────────────────────────────────────────────
 
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
 
// ── Slots ───────────────────────────────────────────────────────────────────
 
export class GetSlotsQueryDto {
    @IsDateString()
    from: string;
 
    @IsDateString()
    to: string;
 
    @IsOptional()
    @IsInt()
    @Min(15)
    @Max(180)
    durationMin?: number;
}
 
// ── Listados con paginación ─────────────────────────────────────────────────
 
export class PageQueryDto {
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