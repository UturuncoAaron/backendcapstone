import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Res,
    UseGuards,
    HttpCode,
    HttpStatus,
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
    ReporteDiarioDocenteQueryDto,
    ReporteRangoDocenteQueryDto,
    AlertasAusenciaDocenteQueryDto,
    HorariosDiaQueryDto,
} from '../dto/teacher-attendance.dto.js';
import { buildXlsx, workbookToBuffer, buildFilename } from '../excel/excel.helper.js';

/**
 * TeacherAttendanceController
 *
 * Rutas bajo /api/reports/docentes
 *
 * Permisos:
 *   - auxiliar + admin → registrar y ver todo
 *   - otros roles → 403
 *
 * El RolesGuard se aplica a nivel de controlador para proteger todas
 * las rutas. La lógica fina de rol (p.ej. auxiliar solo ve su propia
 * actividad) vive en el servicio.
 */
@Controller('reports/docentes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('auxiliar', 'admin')
export class TeacherAttendanceController {
    constructor(private readonly svc: TeacherAttendanceService) { }

    // ─── Lectura previa para el auxiliar ──────────────────────────────────────

    /**
     * GET /api/reports/docentes/horarios-dia?fecha=2026-05-08
     * Lista los bloques de horario del día con estado actual.
     * El auxiliar lo usa para saber qué bloques faltan registrar.
     */
    @Get('horarios-dia')
    getHorariosDia(
        @CurrentUser() user: AuthUser,
        @Query() q: HorariosDiaQueryDto,
    ) {
        return this.svc.getHorariosDia(user, q.fecha);
    }

    // ─── Escritura ─────────────────────────────────────────────────────────────

    /**
     * POST /api/reports/docentes/registrar
     * Registra o actualiza un bloque individual.
     */
    @Post('registrar')
    @HttpCode(HttpStatus.OK)
    registrar(
        @CurrentUser() user: AuthUser,
        @Body() dto: RegistrarAsistenciaDocenteDto,
    ) {
        return this.svc.registrarAsistencia(user, dto);
    }

    /**
     * POST /api/reports/docentes/registrar/bulk
     * Registra todos los bloques del día en una sola operación transaccional.
     * Preferir este endpoint sobre registrar en loop desde el frontend.
     */
    @Post('registrar/bulk')
    @HttpCode(HttpStatus.OK)
    registrarBulk(
        @CurrentUser() user: AuthUser,
        @Body() dto: RegistrarAsistenciaDocenteBulkDto,
    ) {
        return this.svc.registrarAsistenciaBulk(user, dto);
    }

    // ─── Reportes ──────────────────────────────────────────────────────────────

    /**
     * GET /api/reports/docentes/diario?fecha=2026-05-08&format=json|xlsx
     * Todos los bloques del día con estado de cada docente.
     */
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
            tiene_justificacion: 'Justificado',
            motivo_justificacion: 'Motivo',
            hubo_reemplazo: 'Con reemplazo',
            observacion: 'Observación',
        });
        return this.sendXlsx(res, wb, `asist_docentes_${q.fecha}`);
    }

    /**
     * GET /api/reports/docentes/resumen?fecha_inicio=...&fecha_fin=...&format=json|xlsx
     * Resumen por docente en un rango: % asistencia, ausencias, etc.
     */
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
            permisos: 'Permisos',
            licencias: 'Licencias',
            sin_registro: 'Sin registro',
            ausentes_sin_justificacion: 'Ausentes sin justif.',
            porcentaje_asistencia: '% Asistencia',
        });
        return this.sendXlsx(
            res,
            wb,
            `resumen_docentes_${q.fecha_inicio}_${q.fecha_fin}`,
        );
    }

    /**
     * GET /api/reports/docentes/alertas?fecha_inicio=...&fecha_fin=...&limit=10
     * Top docentes con más ausencias sin justificación.
     * El director usa esto para tomar acciones disciplinarias.
     */
    @Get('alertas')
    getAlertas(
        @CurrentUser() user: AuthUser,
        @Query() q: AlertasAusenciaDocenteQueryDto,
    ) {
        return this.svc.getAlertas(user, q.fecha_inicio, q.fecha_fin, q.limit);
    }

    // ─── Privado ───────────────────────────────────────────────────────────────

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