import {
    IsUUID, IsNumber, IsInt, IsOptional, IsString,
    Min, Max, MaxLength, IsIn, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TIPOS_NOTA, type TipoNota } from '../entities/grade.entity.js';

export class CreateGradeDto {
    @IsUUID()
    alumno_id: string;

    @IsUUID()
    curso_id: string;

    @IsInt()
    @Type(() => Number)
    periodo_id: number;

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