import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query string del endpoint:
 *   GET /api/reports/seccion/:seccionId/resumen?periodo_id=...&umbral=11&format=xlsx
 *
 * - periodo_id  → obligatorio, identifica el periodo a consultar
 * - umbral      → nota mínima para considerar un curso "en riesgo" (default 11)
 * - format      → opcional. 'xlsx' devuelve blob binario;
 *                 si se omite, devuelve JSON (comportamiento legacy)
 */
export class SectionReportQueryDto {
  @IsString()
  periodo_id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  umbral?: number;

  @IsOptional()
  @IsIn(['xlsx'])
  format?: 'xlsx';
}
