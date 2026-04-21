import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';

export class CreateAnnouncementDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    titulo: string;

    @IsString()
    @IsNotEmpty()
    contenido: string;

    @IsEnum(['todos', 'alumnos', 'docentes', 'padres'])
    @IsOptional()
    destinatario?: 'todos' | 'alumnos' | 'docentes' | 'padres';
}