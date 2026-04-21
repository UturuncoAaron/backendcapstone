import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryReportDto {
    @Type(() => Number)
    @IsInt()
    @IsOptional()
    periodo_id?: number;

    @Type(() => Number)
    @IsInt()
    @Min(1) @Max(4)
    @IsOptional()
    bimestre?: number;

    @Type(() => Number)
    @IsInt()
    @IsOptional()
    grado_id?: number;

    @Type(() => Number)
    @IsInt()
    @IsOptional()
    seccion_id?: number;
}