import { IsUUID, IsOptional, IsIn, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/** Formato de salida de un reporte. */
export type ReportFormat = 'json' | 'xlsx';

/** Query base con `format`. */
export class FormatQueryDto {
  @IsOptional()
  @IsIn(['json', 'xlsx'])
  format?: ReportFormat;
}

/** A1 — libreta de notas del alumno. */
export class LibretaQueryDto extends FormatQueryDto {
  @IsUUID()
  alumno_id!: string;

  @IsUUID()
  periodo_id!: string;
}

/** A2 — cuadro de notas (matriz alumnos × actividades) por curso. */
export class CuadroNotasQueryDto extends FormatQueryDto {
  @IsUUID()
  curso_id!: string;

  @IsUUID()
  periodo_id!: string;
}

/** A3 — ranking de promedios por curso. */
export class PromediosCursoQueryDto extends FormatQueryDto {
  @IsUUID()
  curso_id!: string;

  @IsUUID()
  periodo_id!: string;
}

/** A6 — top alumnos + alumnos en riesgo de una sección. */
export class TopRiesgoQueryDto extends FormatQueryDto {
  @IsUUID()
  seccion_id!: string;

  @IsUUID()
  periodo_id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  umbral?: number;
}
