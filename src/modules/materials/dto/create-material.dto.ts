import {
    IsString, IsNotEmpty, IsEnum, IsOptional,
    IsInt, Min, Max, IsUrl, MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { TipoMaterial } from '../entities/material.entity.js';

const emptyToUndefined = ({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value;

export class CreateMaterialDto {
    @IsString() @IsNotEmpty() @MaxLength(200)
    titulo: string;

    @IsEnum(['pdf', 'video', 'link', 'grabacion', 'otro'])
    tipo: TipoMaterial;

    @IsOptional()
    @Transform(emptyToUndefined)
    @IsUrl({ require_protocol: true })
    url?: string;

    @IsOptional()
    @Transform(emptyToUndefined)
    @IsString() @MaxLength(500)
    descripcion?: string;

    @IsOptional()
    @Transform(emptyToUndefined)
    @Type(() => Number)
    @IsInt() @Min(1) @Max(4)
    bimestre?: number;

    @IsOptional()
    @Transform(emptyToUndefined)
    @Type(() => Number)
    @IsInt() @Min(1) @Max(20)
    semana?: number;

    @IsOptional()
    @Transform(emptyToUndefined)
    @Type(() => Number)
    @IsInt() @Min(0)
    orden?: number;
}