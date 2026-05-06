import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AttendanceReportsService } from './attendance-reports.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
  AsistenciaDiariaQueryDto,
  ResumenInasistenciasQueryDto,
  TopInasistentesQueryDto,
} from '../dto/attendance-reports.dto.js';
import {
  buildXlsx,
  workbookToBuffer,
  buildFilename,
} from '../excel/excel.helper.js';

@Controller('reports/asistencias')
@UseGuards(JwtAuthGuard)
export class AttendanceReportsController {
  constructor(private readonly svc: AttendanceReportsService) {}

  // B1
  @Get('diaria')
  async diaria(
    @CurrentUser() user: AuthUser,
    @Query() q: AsistenciaDiariaQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getAsistenciaDiaria(
      user,
      q.seccion_id,
      q.fecha,
    );
    if (q.format !== 'xlsx') return rows;

    const wb = buildXlsx('Asistencia diaria', rows, {
      dni: 'DNI',
      apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno',
      nombre: 'Nombre',
      estado: 'Estado',
      observacion: 'Observación',
      fecha: 'Fecha',
    });
    return this.sendXlsx(res, wb, `asistencia_diaria_${q.fecha}`);
  }

  // B3
  @Get('resumen')
  async resumen(
    @CurrentUser() user: AuthUser,
    @Query() q: ResumenInasistenciasQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getResumenInasistencias(
      user,
      q.seccion_id,
      q.periodo_id,
    );
    if (q.format !== 'xlsx') return rows;

    const wb = buildXlsx('Resumen asistencia', rows, {
      dni: 'DNI',
      apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno',
      nombre: 'Nombre',
      dias_registrados: 'Días registrados',
      asistencias: 'Asistencias',
      tardanzas: 'Tardanzas',
      faltas: 'Faltas',
      justificadas: 'Justificadas',
      porcentaje_asistencia: '% Asistencia',
    });
    return this.sendXlsx(res, wb, `resumen_asistencia_${q.seccion_id}`);
  }

  // B4
  @Get('top-inasistentes')
  async topInasistentes(
    @CurrentUser() user: AuthUser,
    @Query() q: TopInasistentesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getTopInasistentes(
      user,
      q.seccion_id,
      q.periodo_id,
      q.limit,
    );
    if (q.format !== 'xlsx') return rows;

    const wb = buildXlsx('Top inasistentes', rows, {
      dni: 'DNI',
      apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno',
      nombre: 'Nombre',
      faltas: 'Faltas',
      tardanzas: 'Tardanzas',
      justificadas: 'Justificadas',
    });
    return this.sendXlsx(res, wb, `top_inasistentes_${q.seccion_id}`);
  }

  private sendXlsx(
    res: Response,
    wb: ReturnType<typeof buildXlsx>,
    baseName: string,
  ): Buffer {
    const buf = workbookToBuffer(wb);
    const filename = buildFilename(baseName);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return buf;
  }
}
