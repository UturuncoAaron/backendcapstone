import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';

import { AlumnoReportService } from './alumno-report.service.js';
import { AlumnoReportXlsxBuilder } from './alumno-report-xlsx.service.js';
import { AlumnoReportPdfBuilder } from './alumno-report-pdf.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';

@Controller('admin/reports/alumno')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AlumnoReportController {
  constructor(
    private readonly service: AlumnoReportService,
    private readonly xlsxBuilder: AlumnoReportXlsxBuilder,
    private readonly pdfBuilder: AlumnoReportPdfBuilder,
  ) { }

  @Get(':id')
  getReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('anio') anio?: string,
    @Query('periodo_id') periodoId?: string,
  ) {
    return this.service.buildReport(id, parseAnio(anio), periodoId);
  }

  @Get(':id/xlsx')
  @UseInterceptors()
  async downloadXlsx(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('anio') anio?: string,
    @Query('periodo_id') periodoId?: string,
    @Res() res?: Response,
  ): Promise<void> {
    const anioNum = parseAnio(anio);
    const data = await this.service.buildReport(id, anioNum, periodoId);
    const buffer = await this.xlsxBuilder.build(data);
    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', `attachment; filename="${buildFilename(data.personal, anioNum, 'xlsx')}"`);
    res!.send(buffer);
  }

  @Get(':id/pdf')
  @UseInterceptors()
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('anio') anio?: string,
    @Query('periodo_id') periodoId?: string,
    @Res() res?: Response,
  ): Promise<void> {
    const anioNum = parseAnio(anio);
    const data = await this.service.buildReport(id, anioNum, periodoId);
    const buffer = await this.pdfBuilder.build(data);
    res!.setHeader('Content-Type', 'application/pdf');
    res!.setHeader('Content-Disposition', `attachment; filename="${buildFilename(data.personal, anioNum, 'pdf')}"`);
    res!.send(buffer);
  }
}

function parseAnio(anio?: string): number | undefined {
  const n = anio ? parseInt(anio, 10) : undefined;
  return Number.isFinite(n) ? n : undefined;
}

function buildFilename(personal: any, anioNum: number | undefined, ext: string): string {
  const nombre = [personal.apellido_paterno, personal.apellido_materno, personal.nombre]
    .filter(Boolean).join('_').replace(/\s+/g, '_');
  return `reporte_alumno_${nombre}_${anioNum ?? 'completo'}.${ext}`;
}