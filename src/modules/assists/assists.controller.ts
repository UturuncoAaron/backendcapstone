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
} from './dto/asistencia.dto.js';

@Controller('asistencias')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssistsController {
    constructor(private readonly svc: AssistsService) { }

    // ── GENERAL (tutor de sección / staff) ────────────────────────────────

    @Post('general/scan')
    @Roles('staff')
    generalScan(
        @CurrentUser() user: AuthUser,
        @Body() dto: ScanQrDto,
    ) { return this.svc.generalScan(dto, user); }

    @Post('general/:seccionId')
    @Roles('docente', 'staff')
    generalRegister(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: RegisterAsistenciaDto,
    ) { return this.svc.generalRegister(seccionId, dto, user); }

    @Post('general/:seccionId/bulk')
    @Roles('docente', 'staff')
    generalBulk(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: BulkAsistenciaDto,
    ) { return this.svc.generalBulk(seccionId, dto, user); }

    @Get('general/:seccionId')
    @Roles('admin', 'docente', 'staff', 'psicologa')
    generalList(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.generalListBySeccion(seccionId, q); }

    @Get('general/alumno/:alumnoId')
    @Roles('admin', 'docente', 'padre', 'psicologa', 'alumno')
    generalByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.generalListByAlumno(alumnoId, q); }

    @Patch('general/:id')
    @Roles('docente', 'staff')
    generalUpdate(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateAsistenciaDto,
    ) { return this.svc.generalUpdate(id, dto, user); }

    @Delete('general/:id') @HttpCode(HttpStatus.NO_CONTENT)
    @Roles('docente', 'staff')
    generalRemove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) { return this.svc.generalRemove(id, user); }

    // ── POR CURSO (docente del curso) ─────────────────────────────────────

    @Post('curso/:cursoId')
    @Roles('docente')
    classRegister(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: RegisterAsistenciaDto,
    ) { return this.svc.classRegister(cursoId, dto, user); }

    @Post('curso/:cursoId/bulk')
    @Roles('docente')
    classBulk(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: BulkAsistenciaDto,
    ) { return this.svc.classBulk(cursoId, dto, user); }

    @Get('curso/:cursoId')
    @Roles('admin', 'docente', 'padre', 'psicologa')
    classList(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Query() q: ListAsistenciasQueryDto,
    ) { return this.svc.classListByCurso(cursoId, q); }

    @Get('curso/alumno/:alumnoId')
    @Roles('admin', 'docente', 'padre', 'psicologa', 'alumno')
    classByAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @Query() q: ListAsistenciasQueryDto & { cursoId?: string },
    ) { return this.svc.classListByAlumno(alumnoId, q); }

    @Patch('curso/:id')
    @Roles('docente')
    classUpdate(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateAsistenciaDto,
    ) { return this.svc.classUpdate(id, dto, user); }

    @Delete('curso/:id') @HttpCode(HttpStatus.NO_CONTENT)
    @Roles('docente')
    classRemove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) { return this.svc.classRemove(id, user); }

    // ── REPORTE ───────────────────────────────────────────────────────────

    @Get('reporte')
    @Roles('admin', 'docente')
    reporte(@Query() q: ReporteAsistenciaQueryDto) {
        return this.svc.reporte(q);
    }
}