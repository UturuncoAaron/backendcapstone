import {
    IsArray, IsDateString, IsIn, IsOptional, IsString,
    IsUUID, IsNotEmpty, MaxLength, ArrayNotEmpty, ValidateNested, IsInt, Min, Max,
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

    @IsIn(['presente', 'tardanza', 'ausente', 'permiso', 'licencia'])
    estado: string;
}

export class BulkDocenteAsistenciaDto {
    @IsDateString()
    fecha: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegistroDocenteDto)
    registros: RegistroDocenteDto[];
}