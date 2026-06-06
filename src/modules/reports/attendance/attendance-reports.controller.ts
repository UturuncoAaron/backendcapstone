import { Controller, Get, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { AttendanceReportsService } from './attendance-reports.service.js';
import { AttendanceXlsxBuilder, PersonalXlsxBuilder } from './attendance-xlsx-builder.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
  AsistenciaDiariaQueryDto,
  ResumenInasistenciasQueryDto,
  TopInasistentesQueryDto,
  ResumenPersonalRangoQueryDto,
} from '../dto/attendance-reports.dto.js';
import { buildXlsx, workbookToBuffer, buildFilename } from '../excel/excel.helper.js';

@Controller('reports/asistencias')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceReportsController {
  constructor(
    private readonly svc: AttendanceReportsService,
    private readonly xlsxBuilder: AttendanceXlsxBuilder,
    private readonly personalXlsxBuilder: PersonalXlsxBuilder,
  ) { }

  @Get('diaria')
  @Roles('admin', 'docente', 'staff')
  async diaria(
    @CurrentUser() user: AuthUser,
    @Query() q: AsistenciaDiariaQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getAsistenciaDiaria(user, q.seccion_id, q.fecha);
    if (q.format !== 'xlsx') return rows;
    const wb = buildXlsx('Asistencia diaria', rows, {
      dni: 'DNI', apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno', nombre: 'Nombre',
      estado: 'Estado', observacion: 'Observación', fecha: 'Fecha',
    });
    return this.sendXlsx(res, wb, `asistencia_diaria_${q.fecha}`);
  }

  @Get('resumen')
  @Roles('admin', 'docente', 'staff')
  async resumen(
    @CurrentUser() user: AuthUser,
    @Query() q: ResumenInasistenciasQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getResumenInasistencias(user, q.seccion_id, q.periodo_id);
    if (q.format !== 'xlsx') return rows;
    const wb = buildXlsx('Resumen asistencia', rows, {
      dni: 'DNI', apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno', nombre: 'Nombre',
      dias_registrados: 'Días registrados', asistencias: 'Asistencias',
      tardanzas: 'Tardanzas', faltas: 'Faltas',
      justificadas: 'Justificadas', porcentaje_asistencia: '% Asistencia',
    });
    return this.sendXlsx(res, wb, `resumen_asistencia_${q.seccion_id}`);
  }

  @Get('top-inasistentes')
  @Roles('admin', 'docente', 'staff')
  async topInasistentes(
    @CurrentUser() user: AuthUser,
    @Query() q: TopInasistentesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getTopInasistentes(user, q.seccion_id, q.periodo_id, q.limit);
    if (q.format !== 'xlsx') return rows;
    const wb = buildXlsx('Top inasistentes', rows, {
      dni: 'DNI', apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno', nombre: 'Nombre',
      faltas: 'Faltas', tardanzas: 'Tardanzas', justificadas: 'Justificadas',
    });
    return this.sendXlsx(res, wb, `top_inasistentes_${q.seccion_id}`);
  }

  @Get('excel')
  @Roles('admin', 'docente')
  @UseInterceptors()
  async excelCurso(
    @CurrentUser() user: AuthUser,
    @Query('curso_id') cursoId: string,
    @Query('periodo_id') periodoId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Res() res?: Response,
  ) {
    const data = await this.svc.getAsistenciaCursoExcel(user, cursoId, periodoId, desde, hasta);
    const buffer = await this.xlsxBuilder.build(data);
    const parts = [data.meta.curso_nombre.replace(/\s+/g, '_')];
    if (data.meta.periodo_nombre) parts.push(data.meta.periodo_nombre.replace(/\s+/g, '_'));
    if (desde) parts.push(`desde_${desde}`);
    if (hasta) parts.push(`hasta_${hasta}`);
    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', `attachment; filename="Asistencia_${parts.join('_')}.xlsx"`);
    res!.send(buffer);
  }

  @Get('teachers')
  @Roles('admin', 'staff')
  async resumenTeachers(
    @Query() q: ResumenPersonalRangoQueryDto,
  ) {
    return this.svc.getResumenDocentesRango(q.fecha_inicio, q.fecha_fin, q.cuenta_id);
  }

  @Get('staff')
  @Roles('admin', 'staff')
  async resumenStaff(
    @Query() q: ResumenPersonalRangoQueryDto,
  ) {
    return this.svc.getResumenStaffRango(q.fecha_inicio, q.fecha_fin, q.cuenta_id);
  }

  @Get('personal')
  @Roles('admin')
  @UseInterceptors()
  async resumenPersonal(
    @Query() q: ResumenPersonalRangoQueryDto,
    @Res() res: Response,
  ) {
    const [resumen, detalle] = await Promise.all([
      this.svc.getResumenPersonalRango(q.fecha_inicio, q.fecha_fin, q.cuenta_id, q.rol),
      this.svc.getDetallePersonalRango(q.fecha_inicio, q.fecha_fin, q.cuenta_id, q.rol),
    ]);

    if (q.format !== 'xlsx') {
      res.setHeader('Content-Type', 'application/json');
      res.send({ resumen, detalle });
      return;
    }

    const buffer = await this.personalXlsxBuilder.build({
      meta: {
        fecha_inicio: q.fecha_inicio,
        fecha_fin: q.fecha_fin,
        generado_en: new Date().toISOString(),
      },
      resumen,
      detalle,
    });

    const filename = `Asistencia_Personal_${q.fecha_inicio}_al_${q.fecha_fin}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  private async sendXlsx(
    res: Response,
    wb: ReturnType<typeof buildXlsx>,
    baseName: string,
  ) {
    const buf = await workbookToBuffer(wb);
    const filename = buildFilename(baseName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return buf;
  }
}