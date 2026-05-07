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
    CreateRecordDto, UpdateRecordDto,
    CreateAvailabilityDto, CreateBlockDto,
    GetSlotsQueryDto, PageQueryDto,
} from './dto/psychology.dto.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('psychology')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PsychologyController {

    constructor(private readonly service: PsychologyService) { }

    // ── Fichas ──────────────────────────────────────────────────────
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

    // ── Disponibilidad ──────────────────────────────────────────────
    @Post('availability')
    @Roles('psicologa')
    setAvailability(@Body() dto: CreateAvailabilityDto, @CurrentUser() user: AuthUser) {
        return this.service.setAvailability(user.id, dto);
    }

    @Get('availability/:psychologistId')
    @Roles('psicologa', 'padre', 'alumno', 'docente', 'admin')
    getAvailability(@Param('psychologistId', ParseUUIDPipe) psychologistId: string) {
        return this.service.getAvailability(psychologistId);
    }

    @Delete('availability/:id')
    @Roles('psicologa')
    removeAvailability(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.removeAvailability(user.id, id);
    }

    // ── Bloqueos ────────────────────────────────────────────────────
    @Post('blocks')
    @Roles('psicologa')
    createBlock(@Body() dto: CreateBlockDto, @CurrentUser() user: AuthUser) {
        return this.service.createBlock(user.id, dto);
    }

    @Get('blocks')
    @Roles('psicologa')
    getBlocks(
        @CurrentUser() user: AuthUser,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.service.getBlocks(user.id, from, to);
    }

    @Delete('blocks/:id')
    @Roles('psicologa')
    removeBlock(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.removeBlock(user.id, id);
    }

    // ── Slots disponibles (para que el padre/alumno agende) ─────────
    @Get('slots/:psychologistId')
    @Roles('padre', 'alumno', 'psicologa', 'admin', 'docente')
    getSlots(
        @Param('psychologistId', ParseUUIDPipe) psychologistId: string,
        @Query() q: GetSlotsQueryDto,
    ) {
        return this.service.getAvailableSlots(
            psychologistId,
            new Date(q.from),
            new Date(q.to),
            q.durationMin,
        );
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

    // ── Directorio (reusa UsersService — sin credenciales) ──────────
    @Get('directory/students/search')
    @Roles('psicologa', 'docente', 'auxiliar')
    searchStudents(@Query('q') q: string) {
        return this.service.searchStudents(q);
    }

    @Get('directory/students')
    @Roles('psicologa', 'docente', 'auxiliar')
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

    @Get('directory/students/:studentId/parents')
    @Roles('psicologa', 'docente', 'auxiliar')
    getStudentParents(@Param('studentId', ParseUUIDPipe) studentId: string) {
        return this.service.getStudentParents(studentId);
    }

    // ── Listado público de psicólogas (para que padre/alumno agenden) ───────
    @Get('psicologas')
    @Roles('alumno', 'padre', 'psicologa', 'docente', 'auxiliar', 'admin')
    listActivePsicologas(@Query('q') q?: string) {
        return this.service.listActivePsicologas(q);
    }
}
