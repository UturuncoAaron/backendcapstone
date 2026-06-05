import {
  IsUUID,
  IsOptional,
  IsDateString,
  IsInt,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormatQueryDto } from './academic-reports.dto.js';

export class AsistenciaDiariaQueryDto extends FormatQueryDto {
  @IsUUID()
  seccion_id!: string;

  @IsDateString()
  fecha!: string;
}

export class ResumenInasistenciasQueryDto extends FormatQueryDto {
  @IsUUID()
  seccion_id!: string;

  @IsUUID()
  periodo_id!: string;
}

export class TopInasistentesQueryDto extends FormatQueryDto {
  @IsUUID()
  seccion_id!: string;

  @IsUUID()
  periodo_id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ResumenPersonalRangoQueryDto {
  @IsDateString()
  fecha_inicio!: string;

  @IsDateString()
  fecha_fin!: string;

  @IsOptional()
  @IsUUID()
  cuenta_id?: string;
}