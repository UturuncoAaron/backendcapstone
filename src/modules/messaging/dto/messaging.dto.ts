import {
    IsString, IsUUID, IsOptional,
    IsEnum, IsArray, ArrayMinSize, Length,
} from 'class-validator';

export class CreateConversationDto {
    @IsEnum(['academico', 'psicologico', 'disciplinario', 'general'])
    tipo: string;

    @IsOptional()
    @IsUUID()
    studentId?: string;

    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('all', { each: true })
    participantIds: string[];  // IDs de cuentas a agregar además del creador
}

export class SendMessageDto {
    @IsString()
    @Length(1, 5000)
    contenido: string;

    @IsOptional()
    @IsString()
    attachmentStorageKey?: string;

    @IsOptional()
    @IsString()
    attachmentName?: string;
}

export class UpdateMessageDto {
    @IsString()
    @Length(1, 5000)
    contenido: string;
}