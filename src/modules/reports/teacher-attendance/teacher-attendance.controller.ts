import {
    Controller, Get, Post, Body, Query,
    Res, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { TeacherAttendanceService } from './teacher-attendance.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
    RegistrarAsistenciaDocenteDto,
    RegistrarAsistenciaDocenteBulkDto,
    RegistrarAsistenciaDiariaBulkDto,
    ReporteDiarioDocenteQueryDto,
    ReporteRangoDocenteQueryDto,
    AlertasAusenciaDocenteQueryDto,
    HorariosDiaQueryDto,
} from '../dto/teacher-attendance.dto.js';
import { buildXlsx, workbookToBuffer, buildFilename } from '../excel/excel.helper.js';

@Controller('reports/docentes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('auxiliar', 'admin')
export class TeacherAttendanceController {
    constructor(private readonly svc: TeacherAttendanceService) { }

    // ─── NUEVA: Lista de docentes del día (1 fila por docente) ───────────

    /**
     * GET /reports/docentes/docentes-dia?fecha=YYYY-MM-DD
     * Devuelve docentes con clase hoy, con primera/última clase y estado actual.
     * Este es el endpoint que usa la nueva UI del auxiliar.
     */
    @Get('docentes-dia')
    getDocentesDelDia(
        @CurrentUser() user: AuthUser,
        @Query() q: HorariosDiaQueryDto,
    ) {
        return this.svc.getDocentesDelDia(user, q.fecha);
    }

    // ─── NUEVA: Registro diario por docente ──────────────────────────────

    /**
     * POST /reports/docentes/registrar-diario
     * Recibe el estado de cada docente UNA VEZ.
     * El servicio distribuye automáticamente a todos sus bloques.
     */
    @Post('registrar-diario')
    @HttpCode(HttpStatus.OK)
    registrarDiario(
        @CurrentUser() user: AuthUser,
        @Body() dto: RegistrarAsistenciaDiariaBulkDto,
    ) {
        return this.svc.registrarAsistenciaDiariaBulk(user, dto);
    }

    // ─── LEGACY: endpoints anteriores (mantener para compatibilidad) ─────

    @Get('horarios-dia')
    getHorariosDia(
        @CurrentUser() user: AuthUser,
        @Query() q: HorariosDiaQueryDto,
    ) {
        return this.svc.getHorariosDia(user, q.fecha);
    }

    @Post('registrar')
    @HttpCode(HttpStatus.OK)
    registrar(
        @CurrentUser() user: AuthUser,
        @Body() dto: RegistrarAsistenciaDocenteDto,
    ) {
        return this.svc.registrarAsistencia(user, dto);
    }

    @Post('registrar/bulk')
    @HttpCode(HttpStatus.OK)
    registrarBulk(
        @CurrentUser() user: AuthUser,
        @Body() dto: RegistrarAsistenciaDocenteBulkDto,
    ) {
        return this.svc.registrarAsistenciaBulk(user, dto);
    }

    // ─── REPORTES ─────────────────────────────────────────────────────────

    @Get('diario')
    async diario(
        @CurrentUser() user: AuthUser,
        @Query() q: ReporteDiarioDocenteQueryDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const rows = await this.svc.getReporteDiario(user, q.fecha);
        if (q.format !== 'xlsx') return rows;

        const wb = buildXlsx('Asistencia docentes', rows, {
            docente_nombre: 'Docente',
            apellido_paterno: 'Apellido paterno',
            apellido_materno: 'Apellido materno',
            curso_nombre: 'Curso',
            seccion_nombre: 'Sección',
            grado_nombre: 'Grado',
            hora_inicio: 'Hora inicio',
            hora_fin: 'Hora fin',
            aula: 'Aula',
            estado: 'Estado',
            hora_llegada: 'Hora llegada',
            hora_salida_anticipada: 'Hora salida anticipada',
            tiene_justificacion: 'Justificado',
            motivo_justificacion: 'Motivo',
            hubo_reemplazo: 'Con reemplazo',
            observacion: 'Observación',
        });
        return this.sendXlsx(res, wb, `asist_docentes_${q.fecha}`);
    }

    @Get('resumen')
    async resumen(
        @CurrentUser() user: AuthUser,
        @Query() q: ReporteRangoDocenteQueryDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const rows = await this.svc.getResumenRango(user, q.fecha_inicio, q.fecha_fin);
        if (q.format !== 'xlsx') return rows;

        const wb = buildXlsx('Resumen asistencia docentes', rows, {
            docente_nombre: 'Docente',
            apellido_paterno: 'Apellido paterno',
            apellido_materno: 'Apellido materno',
            total_bloques_esperados: 'Bloques esperados',
            presentes: 'Presentes',
            tardanzas: 'Tardanzas',
            ausentes: 'Ausentes',
            justificadas: 'Justificadas',
            salidas_anticipadas: 'Salidas anticipadas',
            porcentaje_asistencia: '% Asistencia',
        });
        return this.sendXlsx(res, wb, `resumen_docentes_${q.fecha_inicio}_${q.fecha_fin}`);
    }

    @Get('alertas')
    alertas(
        @CurrentUser() user: AuthUser,
        @Query() q: AlertasAusenciaDocenteQueryDto,
    ) {
        return this.svc.getAlertas(user, q.fecha_inicio, q.fecha_fin, q.limit);
    }

    private async sendXlsx(
        res: Response,
        wb: ReturnType<typeof buildXlsx>,
        baseName: string,
    ): Promise<Buffer> {
        const buf = await workbookToBuffer(wb);
        const filename = buildFilename(baseName);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return buf;
    }
}