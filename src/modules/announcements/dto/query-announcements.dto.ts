import { IsEnum, IsOptional, IsIn } from 'class-validator';

export class QueryAnnouncementsDto {
    @IsEnum(['todos', 'alumnos', 'docentes', 'padres'])
    @IsOptional()
    destinatario?: 'todos' | 'alumnos' | 'docentes' | 'padres';

    @IsIn(['true', 'false'])
    @IsOptional()
    activo?: string;
}