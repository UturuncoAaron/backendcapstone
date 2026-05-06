import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AcademicReportsService } from './academic-reports.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
  LibretaQueryDto,
  CuadroNotasQueryDto,
  PromediosCursoQueryDto,
  TopRiesgoQueryDto,
} from '../dto/academic-reports.dto.js';
import {
  buildXlsx,
  workbookToBuffer,
  buildFilename,
} from '../excel/excel.helper.js';

/**
 * Reportes académicos (notas).
 *
 * Cada endpoint acepta `?format=json|xlsx`. Por defecto JSON.
 * Las restricciones por rol viven en el service (defensa en profundidad);
 * acá solo exigimos sesión válida.
 */
@Controller('reports/academicos')
@UseGuards(JwtAuthGuard)
export class AcademicReportsController {
  constructor(private readonly svc: AcademicReportsService) {}

  // A1 — Libreta del alumno
  @Get('libreta')
  async libreta(
    @CurrentUser() user: AuthUser,
    @Query() q: LibretaQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getLibreta(user, q.alumno_id, q.periodo_id);
    if (q.format !== 'xlsx') return rows;

    const wb = buildXlsx('Libreta', rows, {
      curso: 'Curso',
      docente: 'Docente',
      total_notas: 'Cant. notas',
      promedio: 'Promedio',
      nota_min: 'Nota mínima',
      nota_max: 'Nota máxima',
    });
    return this.sendXlsx(res, wb, `libreta_${q.alumno_id}`);
  }

  // A2 — Cuadro de notas por curso
  @Get('cuadro-notas')
  async cuadroNotas(
    @CurrentUser() user: AuthUser,
    @Query() q: CuadroNotasQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getCuadroNotas(user, q.curso_id, q.periodo_id);
    if (q.format !== 'xlsx') return rows;

    const wb = buildXlsx('Notas detalle', rows, {
      dni: 'DNI',
      apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno',
      alumno_nombre: 'Nombre',
      actividad: 'Actividad',
      tipo: 'Tipo',
      nota: 'Nota',
      fecha: 'Fecha',
    });
    return this.sendXlsx(res, wb, `cuadro_notas_${q.curso_id}`);
  }

  // A3 — Ranking de promedios por curso
  @Get('promedios-curso')
  async promediosCurso(
    @CurrentUser() user: AuthUser,
    @Query() q: PromediosCursoQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getPromediosPorCurso(
      user,
      q.curso_id,
      q.periodo_id,
    );
    if (q.format !== 'xlsx') return rows;

    const wb = buildXlsx('Promedios curso', rows, {
      dni: 'DNI',
      apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno',
      nombre: 'Nombre',
      notas_registradas: 'Cant. notas',
      promedio: 'Promedio',
      escala: 'Escala',
    });
    return this.sendXlsx(res, wb, `promedios_curso_${q.curso_id}`);
  }

  // A6 — Top alumnos + alumnos en riesgo
  @Get('top-y-riesgo')
  async topYRiesgo(
    @CurrentUser() user: AuthUser,
    @Query() q: TopRiesgoQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.svc.getTopYRiesgo(
      user,
      q.seccion_id,
      q.periodo_id,
      q.umbral,
    );
    if (q.format !== 'xlsx') return rows;

    const wb = buildXlsx('Top y riesgo', rows, {
      dni: 'DNI',
      apellido_paterno: 'Apellido paterno',
      apellido_materno: 'Apellido materno',
      nombre: 'Nombre',
      promedio_general: 'Promedio general',
      cursos_en_riesgo: 'Cursos en riesgo',
      categoria: 'Categoría',
    });
    return this.sendXlsx(res, wb, `top_riesgo_${q.seccion_id}`);
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
