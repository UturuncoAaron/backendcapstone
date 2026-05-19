import {
    IsBooleanString, IsEnum, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateArchivoDto {
    @IsEnum(['ficha', 'test'], { message: 'categoria debe ser ficha o test' })
    categoria!: 'ficha' | 'test';

    @IsOptional()
    @IsString()
    @MaxLength(255)
    nombre?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    descripcion?: string;
    @IsOptional()
    @IsBooleanString()
    confidencial?: string;
}

export class ArchivoQueryDto {
    @IsOptional()
    @IsEnum(['ficha', 'test'])
    categoria?: 'ficha' | 'test';

    @IsOptional()
    @Type(() => Number)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    limit?: number;
}