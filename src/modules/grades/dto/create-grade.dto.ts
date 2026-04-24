import {
    IsUUID, IsInt, IsNumber,
    IsOptional, IsString, Min, Max,
} from 'class-validator';

export class CreateGradeDto {
    @IsUUID()
    alumno_id: string;

    @IsUUID()
    curso_id: string;

    @IsInt()
    periodo_id: number;

    // nota_examenes eliminada: en v5 los exámenes no existen
    @IsNumber() @IsOptional() @Min(0) @Max(20)
    nota_tareas?: number;

    @IsNumber() @IsOptional() @Min(0) @Max(20)
    nota_participacion?: number;

    @IsNumber() @IsOptional() @Min(0) @Max(20)
    nota_final?: number;

    @IsString() @IsOptional()
    observaciones?: string;
}