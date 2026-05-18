import {
  IsString, IsArray, IsOptional, IsBoolean, IsUUID,
  MaxLength, ArrayNotEmpty,
} from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  titulo: string;

  @IsString()
  contenido: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  destinatarios: string[];

  @IsOptional()
  @IsBoolean()
  importante?: boolean;

  @IsOptional()
  @IsBoolean()
  fijado?: boolean;

  @IsOptional()
  @IsString()
  fijado_hasta?: string;

  @IsOptional()
  @IsUUID()
  periodo_id?: string;
}