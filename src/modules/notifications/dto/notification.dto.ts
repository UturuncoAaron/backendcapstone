import {
  IsUUID,
  IsString,
  IsOptional,
  Length,
  IsArray,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
export const NOTIFICATION_TYPES = [
  'cita_agendada',
  'cita_confirmada',
  'cita_cancelada',
  'cita_recordatorio',
  'mensaje_nuevo',
  'libreta_disponible',
  'tarea_nueva',
  'tarea_vence_pronto',
  'tarea_calificada',
  'comunicado_nuevo',
  'contrato_por_vencer',
  'asistencia_registrada',
  'inasistencia_alumno',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export class CreateNotificationDto {
  @IsUUID()
  accountId: string;

  @IsString()
  @IsIn(NOTIFICATION_TYPES)
  @Length(1, 40)
  tipo: NotificationType;

  @IsString()
  @Length(1, 200)
  titulo: string;

  @IsOptional()
  @IsString()
  cuerpo?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;
}

export class CreateBulkNotificationDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  accountIds: string[];

  @IsString()
  @IsIn(NOTIFICATION_TYPES)
  @Length(1, 40)
  tipo: NotificationType;

  @IsString()
  @Length(1, 200)
  titulo: string;

  @IsOptional()
  @IsString()
  cuerpo?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;
}