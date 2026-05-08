
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
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormatQueryDto } from './academic-reports.dto.js';

// ─── Registrar / actualizar un bloque ────────────────────────────────────────

export class RegistrarAsistenciaDocenteDto {
    @IsUUID()
    horario_id!: string;

    @IsDateString()
    fecha!: string;

    @IsIn(['presente', 'tardanza', 'ausente', 'permiso', 'licencia'])
    estado!: string;

    /** Solo cuando estado = 'tardanza'. Formato HH:MM */
    @IsOptional()
    @Matches(/^\d{2}:\d{2}$/, { message: 'hora_llegada debe tener formato HH:MM' })
    @ValidateIf((o) => o.estado === 'tardanza')
    hora_llegada?: string;

    @IsOptional()
    @IsBoolean()
    tiene_justificacion?: boolean;

    /** Obligatorio si tiene_justificacion = true */
    @IsOptional()
    @IsString()
    @MaxLength(500)
    @ValidateIf((o) => o.tiene_justificacion === true)
    motivo_justificacion?: string;

    @IsOptional()
    @IsBoolean()
    hubo_reemplazo?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    observacion?: string;
}

/** Registro masivo — el auxiliar envía todos los bloques del día de una vez */
export class RegistrarAsistenciaDocenteBulkDto {
    @IsDateString()
    fecha!: string;

    @Type(() => RegistrarAsistenciaDocenteDto)
    registros!: RegistrarAsistenciaDocenteDto[];
}

// ─── Query params para reportes ──────────────────────────────────────────────

/** Reporte diario de asistencia docente */
export class ReporteDiarioDocenteQueryDto extends FormatQueryDto {
    @IsDateString()
    fecha!: string;
}

/** Reporte por rango de fechas */
export class ReporteRangoDocenteQueryDto extends FormatQueryDto {
    @IsDateString()
    fecha_inicio!: string;

    @IsDateString()
    fecha_fin!: string;
}

/** Alertas: top docentes con más ausencias */
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

/** Horarios del día para tomar asistencia */
export class HorariosDiaQueryDto {
    @IsDateString()
    fecha!: string;
}