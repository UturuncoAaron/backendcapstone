import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GradesQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(2020)
    @Max(2099)
    anio?: number;
    @IsOptional()
    @IsUUID()
    periodoId?: string;
}

export class AttendanceQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(2020)
    @Max(2099)
    anio?: number;
    @IsOptional()
    @IsUUID()
    periodoId?: string;
}