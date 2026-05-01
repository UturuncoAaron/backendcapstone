import { IsUUID, IsString, IsOptional, IsEnum, Length } from 'class-validator';

export class CreateNotificationDto {
    @IsUUID()
    accountId: string;

    @IsEnum([
        'cita_agendada', 'cita_confirmada', 'cita_cancelada', 'cita_recordatorio',
        'mensaje_nuevo',
        'libreta_disponible',
        'tarea_nueva', 'tarea_vence_pronto', 'tarea_calificada',
        'comunicado_nuevo',
        'contrato_por_vencer',
    ])
    tipo: string;

    @IsString()
    @Length(1, 200)
    titulo: string;

    @IsOptional()
    @IsString()
    cuerpo?: string;

    @IsOptional()
    @IsUUID()
    referenceId?: string;

    @IsOptional()
    @IsString()
    referenceType?: string;
}

export class CreateBulkNotificationDto {
    @IsUUID('all', { each: true })
    accountIds: string[];

    @IsEnum([
        'cita_agendada', 'cita_confirmada', 'cita_cancelada', 'cita_recordatorio',
        'mensaje_nuevo',
        'libreta_disponible',
        'tarea_nueva', 'tarea_vence_pronto', 'tarea_calificada',
        'comunicado_nuevo',
        'contrato_por_vencer',
    ])
    tipo: string;

    @IsString()
    @Length(1, 200)
    titulo: string;

    @IsOptional()
    @IsString()
    cuerpo?: string;

    @IsOptional()
    @IsUUID()
    referenceId?: string;

    @IsOptional()
    @IsString()
    referenceType?: string;
}