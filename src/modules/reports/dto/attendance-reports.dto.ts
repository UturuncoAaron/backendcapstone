import {
  IsUUID,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormatQueryDto } from './academic-reports.dto.js';

/** B1 — asistencia diaria por sección. */
export class AsistenciaDiariaQueryDto extends FormatQueryDto {
  @IsUUID()
  seccion_id!: string;

  @IsDateString()
  fecha!: string;
}

/** B3 — resumen de inasistencias por sección/periodo. */
export class ResumenInasistenciasQueryDto extends FormatQueryDto {
  @IsUUID()
  seccion_id!: string;

  @IsUUID()
  periodo_id!: string;
}

/** B4 — top inasistentes por sección/periodo. */
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
