import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class GradeTaskDto {
    @IsNumber()
    @Min(0)
    @Max(20)
    calificacion: number;

    @IsString()
    @IsOptional()
    comentario?: string;
}