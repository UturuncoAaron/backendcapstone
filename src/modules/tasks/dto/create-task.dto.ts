import { IsString, IsNotEmpty, IsOptional, IsDateString, IsInt, Min, Max } from 'class-validator';

export class CreateTaskDto {
    @IsString()
    @IsNotEmpty()
    titulo: string;

    @IsString()
    @IsOptional()
    descripcion?: string;

    @IsDateString()
    fecha_entrega: string;

    @IsInt()
    @Min(1)
    @Max(20)
    @IsOptional()
    puntos_max?: number;
}