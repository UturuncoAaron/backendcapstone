import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { PsychologyService } from './psychology.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
    CreateRecordDto, UpdateRecordDto, PageQueryDto,
    CreateInformeDto, UpdateInformeDto,
} from './dto/psychology.dto.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('psychology')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PsychologyController {

    constructor(private readonly service: PsychologyService) { }

    // ── Fichas psicológicas ─────────────────────────────────────────
    @Post('records')
    @Roles('psicologa')
    createRecord(@Body() dto: CreateRecordDto, @CurrentUser() user: AuthUser) {
        return this.service.createRecord(user.id, dto);
    }

    @Get('records/student/:studentId')
    @Roles('psicologa')
    getRecords(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @Query() q: PageQueryDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getRecordsByStudent(user.id, studentId, q);
    }

    @Patch('records/:id')
    @Roles('psicologa')
    updateRecord(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateRecordDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.updateRecord(user.id, id, dto);
    }

    @Delete('records/:id')
    @Roles('psicologa')
    deleteRecord(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.deleteRecord(user.id, id);
    }

    // ── Mis alumnos (vista psicóloga) ───────────────────────────────
    @Get('my-students')
    @Roles('psicologa')
    getMyStudents(@Query() q: PageQueryDto, @CurrentUser() user: AuthUser) {
        return this.service.getMyStudents(user.id, q);
    }

    @Delete('my-students/:studentId')
    @Roles('psicologa')
    unassignStudent(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.unassignStudent(user.id, studentId);
    }

    // ── Directorio ──────────────────────────────────────────────────
    @Get('directory/students/search')
    @Roles('psicologa', 'docente', 'auxiliar', 'admin')
    searchStudents(@Query('q') q: string) {
        return this.service.searchStudents(q);
    }

    @Get('directory/students')
    @Roles('psicologa', 'docente', 'auxiliar', 'admin')
    listStudents(
        @Query('q') q?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.service.listStudents({
            search: q,
            page: page ? parseInt(page, 10) : 1,
            limit: limit ? parseInt(limit, 10) : 50,
        });
    }

    @Get('directory/parents/search')
    @Roles('psicologa', 'docente', 'auxiliar', 'admin')
    searchParents(@Query('q') q: string) {
        return this.service.searchParents(q);
    }

    @Get('directory/students/:studentId/parents')
    @Roles('psicologa', 'docente', 'auxiliar', 'admin')
    getStudentParents(@Param('studentId', ParseUUIDPipe) studentId: string) {
        return this.service.getStudentParents(studentId);
    }

    /**
     * Detalle público de un alumno por id, accesible desde el directorio.
     * Permite a la psicóloga / docente / auxiliar / admin abrir la ficha
     * (`/psicologa/student/:id`) sin requerir rol admin.
     *
     * No expone credenciales (codigo_acceso, numero_documento, tipo_documento).
     */
    @Get('directory/students/:studentId')
    @Roles('psicologa', 'docente', 'auxiliar', 'admin')
    getStudentDetail(@Param('studentId', ParseUUIDPipe) studentId: string) {
        return this.service.getStudentDetail(studentId);
    }

    // ── Listado público de psicólogas ───────────────────────────────
    @Get('psicologas')
    @Roles('alumno', 'padre', 'psicologa', 'docente', 'auxiliar', 'admin')
    listActivePsicologas(@Query('q') q?: string) {
        return this.service.listActivePsicologas(q);
    }

    // ── Informes psicológicos ───────────────────────────────────────
    // Solo la psicóloga propietaria puede leer/editar sus informes (incluye
    // admin? — por ahora NO; las leyes peruanas de salud mental y la
    // política del colegio piden confidencialidad estricta de la ficha
    // clínica). Si más adelante se quiere "supervisión" agregar un rol
    // intermedio (jefe de psicología) en vez de relajar este check.

    @Post('informes')
    @Roles('psicologa')
    createInforme(
        @Body() dto: CreateInformeDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.createInforme(user.id, dto);
    }

    @Get('informes/student/:studentId')
    @Roles('psicologa')
    listInformes(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @Query() q: PageQueryDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.listInformesByStudent(user.id, studentId, q);
    }

    @Get('informes/:id')
    @Roles('psicologa')
    getInforme(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.findInformeById(user.id, id);
    }

    @Patch('informes/:id')
    @Roles('psicologa')
    updateInforme(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateInformeDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.updateInforme(user.id, id, dto);
    }

    @Post('informes/:id/finalizar')
    @Roles('psicologa')
    finalizeInforme(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.finalizeInforme(user.id, id);
    }

    @Delete('informes/:id')
    @Roles('psicologa')
    deleteInforme(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.deleteInforme(user.id, id);
    }
}