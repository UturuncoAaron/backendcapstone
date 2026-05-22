import {
    IsUUID,
    IsDateString,
    IsIn,
    IsOptional,
    IsBoolean,
    IsString,
    MaxLength,
    ValidateIf,
    Matches,
    IsInt,
    IsArray,
    ValidateNested,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormatQueryDto } from './academic-reports.dto.js';

// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS VÁLIDOS
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADOS_DOCENTE = [
    'presente',
    'tardanza',
    'salida_anticipada',
    'ausente',
    'permiso',
    'licencia',
] as const;

export type EstadoDocenteUI = typeof ESTADOS_DOCENTE[number];

// ─────────────────────────────────────────────────────────────────────────────
// DTO PRINCIPAL — registro diario por docente (no por bloque)
// El backend distribuye automáticamente a los bloques del horario
// ─────────────────────────────────────────────────────────────────────────────

export class RegistrarAsistenciaDiariaDocenteDto {
    /** ID del docente */
    @IsUUID()
    docente_id!: string;

    /**
     * Estado global del docente para el día.
     * El backend lo distribuye a todos sus bloques, con lógica especial
     * para salida_anticipada (divide en presente/permiso por hora).
     */
    @IsIn(ESTADOS_DOCENTE)
    estado!: EstadoDocenteUI;

    /**
     * Hora de llegada — requerida en tardanza y salida_anticipada.
     * Formato HH:MM (24h).
     */
    @IsOptional()
    @Matches(/^\d{2}:\d{2}$/, { message: 'hora_llegada debe tener formato HH:MM' })
    @ValidateIf(o => o.estado === 'tardanza' || o.estado === 'salida_anticipada')
    hora_llegada?: string;

    /**
     * Hora en que el docente salió anticipadamente.
     * Solo aplica cuando estado = 'salida_anticipada'.
     * Bloques que empiezan ANTES de esta hora → presente
     * Bloques que empiezan DESPUÉS de esta hora → permiso
     */
    @IsOptional()
    @Matches(/^\d{2}:\d{2}$/, { message: 'hora_salida_anticipada debe tener formato HH:MM' })
    @ValidateIf(o => o.estado === 'salida_anticipada')
    hora_salida_anticipada?: string;

    /** Motivo — requerido en salida_anticipada, ausente, permiso, licencia */
    @IsOptional()
    @IsString()
    @MaxLength(500)
    @ValidateIf(o => ['salida_anticipada', 'ausente', 'permiso', 'licencia'].includes(o.estado))
    motivo?: string;

    @IsOptional()
    @IsBoolean()
    hubo_reemplazo?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    observacion?: string;
}

/** Registro masivo diario — el auxiliar envía todos los docentes del día */
export class RegistrarAsistenciaDiariaBulkDto {
    @IsDateString()
    fecha!: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegistrarAsistenciaDiariaDocenteDto)
    docentes!: RegistrarAsistenciaDiariaDocenteDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs LEGACY — mantener para compatibilidad con el endpoint anterior
// ─────────────────────────────────────────────────────────────────────────────

export class RegistrarAsistenciaDocenteDto {
    @IsUUID()
    horario_id!: string;

    @IsDateString()
    fecha!: string;

    @IsIn(['presente', 'tardanza', 'ausente', 'permiso', 'licencia', 'salida_anticipada'])
    estado!: string;

    @IsOptional()
    @Matches(/^\d{2}:\d{2}$/, { message: 'hora_llegada debe tener formato HH:MM' })
    hora_llegada?: string;

    @IsOptional()
    @Matches(/^\d{2}:\d{2}$/, { message: 'hora_salida_anticipada debe tener formato HH:MM' })
    hora_salida_anticipada?: string;

    @IsOptional()
    @IsBoolean()
    tiene_justificacion?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    motivo_justificacion?: string;

    @IsOptional()
    @IsBoolean()
    hubo_reemplazo?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    observacion?: string;
}

export class RegistrarAsistenciaDocenteBulkDto {
    @IsDateString()
    fecha!: string;

    @Type(() => RegistrarAsistenciaDocenteDto)
    registros!: RegistrarAsistenciaDocenteDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY PARAMS
// ─────────────────────────────────────────────────────────────────────────────

export class ReporteDiarioDocenteQueryDto extends FormatQueryDto {
    @IsDateString()
    fecha!: string;
}

export class ReporteRangoDocenteQueryDto extends FormatQueryDto {
    @IsDateString()
    fecha_inicio!: string;

    @IsDateString()
    fecha_fin!: string;
}

export class AlertasAusenciaDocenteQueryDto extends FormatQueryDto {
    @IsDateString()
    fecha_inicio!: string;

    @IsDateString()
    fecha_fin!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}

export class HorariosDiaQueryDto {
    @IsDateString()
    fecha!: string;
}