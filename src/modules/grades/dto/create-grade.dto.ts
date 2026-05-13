import {
    IsUUID, IsNumber, IsOptional, IsString,
    Min, Max, MaxLength, IsIn, IsDateString,
} from 'class-validator';
import { TIPOS_NOTA, type TipoNota } from '../entities/grade.entity.js';

export class CreateGradeDto {
    @IsUUID()
    alumno_id: string;

    @IsUUID()
    curso_id: string;

    // periodo_id es UUID, no entero (ver schema). La validación previa
    // con `@IsInt` rebotaba el body con 400 desde el frontend.
    @IsUUID()
    periodo_id: string;

    @IsString()
    @MaxLength(200)
    titulo: string;

    @IsIn(TIPOS_NOTA)
    tipo: TipoNota;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0) @Max(20)
    @IsOptional()
    nota?: number | null;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    observaciones?: string | null;

    @IsDateString()
    @IsOptional()
    fecha?: string | null;
}