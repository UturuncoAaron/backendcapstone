import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AlumnoReportService } from './alumno-report.service.js';
import { AlumnoReportXlsxBuilder } from './alumno-report-xlsx.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';

/**
 * Reporte general por alumno.
 *
 * Endpoints (V1, solo admin):
 *   GET /api/admin/reports/alumno/:id            → reporte completo JSON
 *   GET /api/admin/reports/alumno/:id?anio=2024  → reporte filtrado a ese año
 *   GET /api/admin/reports/alumno/:id/xlsx        → descarga Excel
 *   GET /api/admin/reports/alumno/:id/xlsx?anio=2024
 */
@Controller('admin/reports/alumno')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AlumnoReportController {
  constructor(
    private readonly service: AlumnoReportService,
    private readonly xlsxBuilder: AlumnoReportXlsxBuilder,
  ) { }

  @Get(':id')
  getReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('anio') anio?: string,
  ) {
    const anioNum = anio ? parseInt(anio, 10) : undefined;
    return this.service.buildReport(
      id,
      Number.isFinite(anioNum) ? anioNum : undefined,
    );
  }

  @Get(':id/xlsx')
  async downloadXlsx(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('anio') anio?: string,
    @Res() res?: Response,
  ): Promise<void> {
    const anioNum = anio ? parseInt(anio, 10) : undefined;
    const data = await this.service.buildReport(
      id,
      Number.isFinite(anioNum) ? anioNum : undefined,
    );

    const buffer = await this.xlsxBuilder.build(data);

    const nombre = [
      data.personal.apellido_paterno,
      data.personal.apellido_materno,
      data.personal.nombre,
    ]
      .filter(Boolean)
      .join('_')
      .replace(/\s+/g, '_');

    const filename = `reporte_alumno_${nombre}_${anioNum ?? 'completo'}.xlsx`;

    res!.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res!.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res!.send(buffer);
  }
}
