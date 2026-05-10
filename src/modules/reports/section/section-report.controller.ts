import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { SectionReportService } from './section-report.service.js';
import { XlsxBuilderService } from '../excel/xlsx-builder.service.js';
import { SectionReportQueryDto } from '../dto/section-report.dto.js';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/types/auth-user.js';

@Controller('reports/seccion')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SectionReportController {
  constructor(
    private readonly service: SectionReportService,
    private readonly xlsxBuilder: XlsxBuilderService,
  ) {}

  @Get(':seccionId/resumen')
  @Roles('admin', 'docente', 'tutor')
  async getResumen(
    @Param('seccionId') seccionId: string,
    @Query() query: SectionReportQueryDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.service.getSeccionResumen(
      user,
      seccionId,
      query.periodo_id,
      query.umbral ?? 11,
    );

    if (query.format === 'xlsx') {
      const buffer = this.xlsxBuilder.buildSeccionResumenXlsx(data);
      const filename = buildXlsxFilename(data, seccionId);

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        // Permite que el frontend lea el header de filename via fetch/axios
        'Access-Control-Expose-Headers': 'Content-Disposition',
      });

      return new StreamableFile(buffer);
    }

    // Camino JSON: comportamiento legacy intacto
    return data;
  }
}

/**
 * Nombre de archivo legible: "reporte_1A_2026-I.xlsx"
 * Cae al fallback "reporte_seccion_<id>.xlsx" si faltan campos.
 */
function buildXlsxFilename(
  data: { seccion?: { grado?: string; nombre?: string }; periodo?: { nombre?: string } },
  seccionId: string,
): string {
  const grado = sanitize(data.seccion?.grado);
  const nombre = sanitize(data.seccion?.nombre);
  const periodo = sanitize(data.periodo?.nombre);

  if (grado && nombre) {
    const tail = periodo ? `_${periodo}` : '';
    return `reporte_${grado}${nombre}${tail}.xlsx`;
  }
  return `reporte_seccion_${seccionId}.xlsx`;
}

function sanitize(s: string | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
