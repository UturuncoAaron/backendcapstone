import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, ParseUUIDPipe, Query, HttpCode, HttpStatus,
    UseGuards,
} from '@nestjs/common';
import { AssistsService } from './assists.service.js';
import type { AuthUser } from './assists.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
    RegisterAsistenciaDto, BulkAsistenciaDto, UpdateAsistenciaDto,
    ListAsistenciasQueryDto, ReporteAsistenciaQueryDto, ScanQrDto,
} from './dto/asistencia.dto.js';

@Controller('asistencias')
@UseGuards(JwtAuthGuard)
export class AssistsController {
    constructor(private readonly svc: AssistsService) { }

    // ── GENERAL (tutor de sección / auxiliar / admin) ──

    /** Escanea el QR del carnet del alumno y marca asistencia general automática. */
    @Post('general/scan')
    generalScan(
        @CurrentUser() user: AuthUser,
        @Body() dto: ScanQrDto,
    ) { return this.svc.generalScan(dto, user); }

    /** Registra/actualiza la asistencia general de un alumno en una sección. */
    @Post('general/:seccionId')
    generalRegister(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: RegisterAsistenciaDto,
    ) { return this.svc.generalRegister(seccionId, dto, user); }

    /** Registra asistencia general de varios alumnos en una sola llamada. */
    @Post('general/:seccionId/bulk')
    generalBulk(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: BulkAsistenciaDto,
    ) { return this.svc.generalBulk(seccionId, dto, user); }

    /** Lista asistencias generales de una sección (por fecha o rango). */
    @Get('general/:seccionId')
    generalList(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.generalListBySeccion(seccionId, q); }

    /** Lista asistencias generales históricas de un alumno. */
    @Get('general/alumno/:alumnoId')
    generalByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.generalListByAlumno(alumnoId, q); }

    /** Modifica el estado u observación de un registro general. */
    @Patch('general/:id')
    generalUpdate(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateAsistenciaDto,
    ) { return this.svc.generalUpdate(id, dto, user); }

    /** Elimina un registro general. */
    @Delete('general/:id') @HttpCode(HttpStatus.NO_CONTENT)
    generalRemove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) { return this.svc.generalRemove(id, user); }

    // ── POR CURSO (docente del curso / admin) ──

    /** Registra/actualiza la asistencia de un alumno en un curso. */
    @Post('curso/:cursoId')
    classRegister(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: RegisterAsistenciaDto,
    ) { return this.svc.classRegister(cursoId, dto, user); }

    /** Registra asistencia de varios alumnos en un curso en una sola llamada. */
    @Post('curso/:cursoId/bulk')
    classBulk(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: BulkAsistenciaDto,
    ) { return this.svc.classBulk(cursoId, dto, user); }

    /** Lista asistencias de un curso (por fecha o rango). */
    @Get('curso/:cursoId')
    classList(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.classListByCurso(cursoId, q); }

    /** Lista asistencias históricas de un alumno (filtrable por curso). */
    @Get('curso/alumno/:alumnoId')
    classByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Query() q: ListAsistenciasQueryDto & { cursoId?: string },
    ) { return this.svc.classListByAlumno(alumnoId, q); }

    /** Modifica el estado u observación de un registro de curso. */
    @Patch('curso/:id')
    classUpdate(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateAsistenciaDto,
    ) { return this.svc.classUpdate(id, dto, user); }

    /** Elimina un registro de curso. */
    @Delete('curso/:id') @HttpCode(HttpStatus.NO_CONTENT)
    classRemove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) { return this.svc.classRemove(id, user); }

    // ── REPORTE ──

    /** Reporte agregado de asistencias por sección o curso para Excel. */
    @Get('reporte')
    reporte(@Query() q: ReporteAsistenciaQueryDto) {
        return this.svc.reporte(q);
    }
}