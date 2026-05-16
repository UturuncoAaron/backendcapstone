import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe, Query, HttpCode, HttpStatus,
    UseGuards,
} from '@nestjs/common';
import { AssistsService } from './assists.service.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
    RegisterAsistenciaDto, BulkAsistenciaDto, UpdateAsistenciaDto,
    ListAsistenciasQueryDto, ReporteAsistenciaQueryDto, ScanQrDto,
    BulkDocenteAsistenciaDto,
} from './dto/asistencia.dto.js';

/**
 * Reglas de autorización (defensa en profundidad):
 *
 * - El **admin NO toma asistencia** (no puede crear/editar/borrar registros).
 *   Sí puede leer historiales, listas y el reporte agregado.
 * - El **tutor de sección** (un docente designado) toma la asistencia general
 *   por sección.
 * - El **docente** toma la asistencia de su(s) propio(s) curso(s).
 * - El **auxiliar** usa el escaneo QR en la entrada y puede consultar listas
 *   del día.
 *
 * Las restricciones finas (que el docente sea efectivamente del curso, que el
 * tutor sea de esa sección, que el padre sea de ese alumno) viven en
 * `AssistsService` (`assertDocenteDelCurso`, `assertTutorDeSeccion`, etc.).
 */
@Controller('asistencias')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssistsController {
    constructor(private readonly svc: AssistsService) { }

    // ── GENERAL (tutor de sección / auxiliar) ──

    /** Escanea el QR del carnet del alumno y marca asistencia general automática. */
    @Post('general/scan')
    @Roles('auxiliar')
    generalScan(
        @CurrentUser() user: AuthUser,
        @Body() dto: ScanQrDto,
    ) { return this.svc.generalScan(dto, user); }

    /** Registra/actualiza la asistencia general de un alumno en una sección. */
    @Post('general/:seccionId')
    @Roles('docente', 'auxiliar')
    generalRegister(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: RegisterAsistenciaDto,
    ) { return this.svc.generalRegister(seccionId, dto, user); }

    /** Registra asistencia general de varios alumnos en una sola llamada. */
    @Post('general/:seccionId/bulk')
    @Roles('docente', 'auxiliar')
    generalBulk(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: BulkAsistenciaDto,
    ) { return this.svc.generalBulk(seccionId, dto, user); }

    /** Lista asistencias generales de una sección (por fecha o rango). */
    @Get('general/:seccionId')
    @Roles('admin', 'docente', 'auxiliar', 'psicologa')
    generalList(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.generalListBySeccion(seccionId, q); }

    /** Lista asistencias generales históricas de un alumno. */
    @Get('general/alumno/:alumnoId')
    @Roles('admin', 'docente', 'padre', 'psicologa', 'alumno')
    generalByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.generalListByAlumno(alumnoId, q); }

    /** Modifica el estado u observación de un registro general. */
    @Patch('general/:id')
    @Roles('docente', 'auxiliar')
    generalUpdate(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateAsistenciaDto,
    ) { return this.svc.generalUpdate(id, dto, user); }

    /** Elimina un registro general. */
    @Delete('general/:id') @HttpCode(HttpStatus.NO_CONTENT)
    @Roles('docente', 'auxiliar')
    generalRemove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) { return this.svc.generalRemove(id, user); }

    // ── POR CURSO (docente del curso) ──

    /** Registra/actualiza la asistencia de un alumno en un curso. */
    @Post('curso/:cursoId')
    @Roles('docente')
    classRegister(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: RegisterAsistenciaDto,
    ) { return this.svc.classRegister(cursoId, dto, user); }

    /** Registra asistencia de varios alumnos en un curso en una sola llamada. */
    @Post('curso/:cursoId/bulk')
    @Roles('docente')
    classBulk(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: BulkAsistenciaDto,
    ) { return this.svc.classBulk(cursoId, dto, user); }

    /** Lista asistencias de un curso (por fecha o rango). */
    @Get('curso/:cursoId')
    @Roles('admin', 'docente', 'padre', 'psicologa')
    classList(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.classListByCurso(cursoId, q); }

    /** Lista asistencias históricas de un alumno (filtrable por curso). */
    @Get('curso/alumno/:alumnoId')
    @Roles('admin', 'docente', 'padre', 'psicologa', 'alumno')
    classByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Query() q: ListAsistenciasQueryDto & { cursoId?: string },
    ) { return this.svc.classListByAlumno(alumnoId, q); }

    /** Modifica el estado u observación de un registro de curso. */
    @Patch('curso/:id')
    @Roles('docente')
    classUpdate(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateAsistenciaDto,
    ) { return this.svc.classUpdate(id, dto, user); }

    /** Elimina un registro de curso. */
    @Delete('curso/:id') @HttpCode(HttpStatus.NO_CONTENT)
    @Roles('docente')
    classRemove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) { return this.svc.classRemove(id, user); }

    // ── DOCENTE (auxiliar / admin) ──

    /** Registra la asistencia de docentes en bloque para el día. */
    @Post('docente/bulk')
    @Roles('auxiliar', 'admin')
    bulkDocente(@Body() dto: BulkDocenteAsistenciaDto) {
        return this.svc.bulkDocenteAsistencia(dto);
    }

    // ── REPORTE ──

    /** Reporte agregado de asistencias por sección o curso para Excel. */
    @Get('reporte')
    @Roles('admin', 'docente')
    reporte(@Query() q: ReporteAsistenciaQueryDto) {
        return this.svc.reporte(q);
    }
}