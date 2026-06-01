import {
    IsArray, IsDateString, IsIn, IsOptional, IsString,
    IsUUID, IsNotEmpty, MaxLength, ArrayNotEmpty,
    ValidateNested, IsInt, Min, Max, IsBoolean, Matches,
    ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ESTADOS_ASISTENCIA } from '../entities/attendance-general.entity.js';
import type { EstadoAsistencia } from '../entities/attendance-general.entity.js';

export class AsistenciaItemDto {
    @IsUUID() alumno_id: string;
    @IsIn(ESTADOS_ASISTENCIA) estado: EstadoAsistencia;
    @IsOptional() @IsString() @MaxLength(500) observacion?: string;
}

export class RegisterAsistenciaDto extends AsistenciaItemDto {
    @IsDateString() fecha: string;
    @IsOptional() @IsUUID() periodo_id?: string;
}

export class BulkAsistenciaDto {
    @IsDateString() fecha: string;
    @IsOptional() @IsUUID() periodo_id?: string;
    @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true })
    @Type(() => AsistenciaItemDto)
    alumnos: AsistenciaItemDto[];
}

export class UpdateAsistenciaDto {
    @IsOptional() @IsIn(ESTADOS_ASISTENCIA) estado?: EstadoAsistencia;
    @IsOptional() @IsString() @MaxLength(500) observacion?: string | null;
}

export class ListAsistenciasQueryDto {
    @IsOptional() @IsDateString() fecha?: string;
    @IsOptional() @IsDateString() desde?: string;
    @IsOptional() @IsDateString() hasta?: string;
    @IsOptional() @IsUUID() periodo_id?: string;
    @IsOptional() @IsInt() @Min(1) @Max(500) @Type(() => Number) limit?: number;
    @IsOptional() @IsInt() @Min(0) @Type(() => Number) offset?: number;
}

export class ReporteAsistenciaQueryDto {
    @IsUUID() periodo_id: string;
    @IsOptional() @IsUUID() seccion_id?: string;
    @IsOptional() @IsUUID() curso_id?: string;
}

export class ScanQrDto {
    @IsString() @IsNotEmpty() qr_token: string;
    @IsOptional() @IsDateString() fecha?: string;
}

export class RegistroDocenteDto {
    @IsUUID()
    horario_id: string;

    @IsUUID()
    docente_id: string;

    @IsOptional()
    @Matches(/^\d{2}:\d{2}$/, { message: 'hora_llegada debe tener formato HH:mm' })
    hora_llegada?: string;

    @IsIn(['presente', 'tardanza', 'falto', 'justificado'])
    estado: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    motivo_justificacion?: string;

    @IsOptional()
    @IsBoolean()
    hubo_reemplazo?: boolean;

    @IsOptional()
    @IsString()
    observacion?: string;
}

export class BulkDocenteAsistenciaDto {
    @IsDateString()
    fecha: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegistroDocenteDto)
    registros: RegistroDocenteDto[];
}

export class RegistrarAsistenciaDocenteDiaDto {
    @IsUUID()
    docente_id: string;

    @IsIn(['presente', 'tardanza', 'falto', 'justificado'])
    estado: string;

    @IsOptional()
    @Matches(/^\d{2}:\d{2}$/, { message: 'hora_llegada debe tener formato HH:MM' })
    hora_llegada?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    @ValidateIf(o => o.estado === 'justificado')
    motivo_justificacion?: string;

    @IsOptional()
    @IsBoolean()
    hubo_reemplazo?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    observacion?: string;
}

export class RegistrarAsistenciaDocenteBulkDiaDto {
    @IsDateString()
    fecha: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegistrarAsistenciaDocenteDiaDto)
    docentes: RegistrarAsistenciaDocenteDiaDto[];
}

export class HorariosDiaQueryDto {
    @IsDateString()
    fecha: string;
}

export class MarcarSalidaDocenteDto {
    @IsUUID()
    horario_id: string;

    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe ser YYYY-MM-DD' })
    fecha: string;

    @IsString()
    @Matches(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'hora_salida debe ser HH:mm o HH:mm:ss' })
    hora_salida: string;
}