import { IsUUID, IsInt, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class CreateGradeDto {
    @IsUUID()
    alumno_id: string;

    @IsUUID()
    curso_id: string;

    @IsInt()
    periodo_id: number;

    @IsInt()
    @Min(1) @Max(4)
    bimestre: number;

    @IsNumber()
    @IsOptional()
    @Min(0) @Max(20)
    nota_examenes?: number;

    @IsNumber()
    @IsOptional()
    @Min(0) @Max(20)
    nota_tareas?: number;

    @IsNumber()
    @IsOptional()
    @Min(0) @Max(20)
    nota_participacion?: number;

    @IsNumber()
    @IsOptional()
    @Min(0) @Max(20)
    nota_final?: number;

    @IsString()
    @IsOptional()
    observaciones?: string;
}