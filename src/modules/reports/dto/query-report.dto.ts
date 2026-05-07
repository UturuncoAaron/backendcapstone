import { IsInt, IsOptional, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params del módulo de reportes.
 * Los IDs son UUIDs en la base de datos; bimestre sigue siendo entero (1..4).
 */
export class QueryReportDto {
    @IsOptional() @IsUUID() periodo_id?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1) @Max(4)
    bimestre?: number;

    @IsOptional() @IsUUID() grado_id?: string;

    @IsOptional() @IsUUID() seccion_id?: string;
}
