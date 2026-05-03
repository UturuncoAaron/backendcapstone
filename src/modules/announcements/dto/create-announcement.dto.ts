import { IsString, IsNotEmpty, IsArray, IsEnum, ArrayMinSize, IsOptional, MaxLength } from 'class-validator';
import { Destinatario } from '../entities/announcement.entity.js';

const DESTINATARIOS_VALIDOS: Destinatario[] = ['todos', 'alumnos', 'docentes', 'padres', 'psicologas'];

export class CreateAnnouncementDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    titulo: string;

    @IsString()
    @IsNotEmpty()
    contenido: string;

    @IsArray()
    @IsEnum(DESTINATARIOS_VALIDOS, { each: true })
    @ArrayMinSize(1)
    @IsOptional()
    destinatarios?: Destinatario[];
}