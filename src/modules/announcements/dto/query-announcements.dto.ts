import { IsEnum, IsOptional, IsIn } from 'class-validator';
import type { Destinatario } from '../entities/announcement.entity.js';

export class QueryAnnouncementsDto {
    @IsEnum(['todos', 'alumnos', 'docentes', 'padres', 'psicologas'])
    @IsOptional()
    rol?: Destinatario;

    @IsIn(['true', 'false'])
    @IsOptional()
    activo?: string;
}