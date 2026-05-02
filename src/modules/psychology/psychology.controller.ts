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
    CreateAppointmentDto, UpdateAppointmentDto,
    CreateAvailabilityDto, CreateBlockDto,
} from './dto/psychology.dto.js';

interface JwtUser { id: string; rol: string; }

@Controller('psychology')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PsychologyController {

    constructor(private readonly service: PsychologyService) { }

    // ── Fichas psicológicas (solo psicóloga asignada) ─────────────────────────

    @Post('records')
    @Roles('psicologa')
    createRecord(@Body() dto: CreateRecordDto, @CurrentUser() user: JwtUser) {
        return this.service.createRecord(user.id, dto);
    }

    @Get('records/student/:studentId')
    @Roles('psicologa')
    getRecords(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @CurrentUser() user: JwtUser,
    ) {
        return this.service.getRecordsByStudent(user.id, studentId);
    }

    @Patch('records/:id')
    @Roles('psicologa')
    updateRecord(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateRecordDto,
        @CurrentUser() user: JwtUser,
    ) {
        return this.service.updateRecord(user.id, id, dto);
    }

    @Delete('records/:id')
    @Roles('psicologa')
    deleteRecord(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: JwtUser,
    ) {
        return this.service.deleteRecord(user.id, id);
    }

    // ── Citas ─────────────────────────────────────────────────────────────────

    @Post('appointments')
    @Roles('psicologa', 'docente')
    createAppointment(@Body() dto: CreateAppointmentDto, @CurrentUser() user: JwtUser) {
        return this.service.createAppointment(user.id, dto);
    }

    @Get('appointments/mine')
    @Roles('psicologa', 'docente')
    getMyAppointments(@CurrentUser() user: JwtUser) {
        return this.service.getMyAppointments(user.id);
    }

    @Get('appointments/parent')
    @Roles('padre')
    getParentAppointments(@CurrentUser() user: JwtUser) {
        return this.service.getAppointmentsByParent(user.id);
    }

    @Get('appointments/student')
    @Roles('alumno')
    getStudentAppointments(@CurrentUser() user: JwtUser) {
        return this.service.getAppointmentsByStudent(user.id);
    }

    @Patch('appointments/:id')
    @Roles('psicologa', 'docente')
    updateAppointment(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAppointmentDto,
        @CurrentUser() user: JwtUser,
    ) {
        return this.service.updateAppointment(id, user.id, dto);
    }

    // ── Disponibilidad ────────────────────────────────────────────────────────

    @Post('availability')
    @Roles('psicologa')
    setAvailability(@Body() dto: CreateAvailabilityDto, @CurrentUser() user: JwtUser) {
        return this.service.setAvailability(user.id, dto);
    }

    @Get('availability/:psychologistId')
    @Roles('psicologa', 'padre', 'admin')
    getAvailability(@Param('psychologistId', ParseUUIDPipe) psychologistId: string) {
        return this.service.getAvailability(psychologistId);
    }

    @Delete('availability/:id')
    @Roles('psicologa')
    removeAvailability(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: JwtUser,
    ) {
        return this.service.removeAvailability(user.id, id);
    }

    // ── Bloqueos ──────────────────────────────────────────────────────────────

    @Post('blocks')
    @Roles('psicologa')
    createBlock(@Body() dto: CreateBlockDto, @CurrentUser() user: JwtUser) {
        return this.service.createBlock(user.id, dto);
    }

    @Get('blocks')
    @Roles('psicologa')
    getBlocks(@CurrentUser() user: JwtUser) {
        return this.service.getBlocks(user.id);
    }

    @Delete('blocks/:id')
    @Roles('psicologa')
    removeBlock(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: JwtUser,
    ) {
        return this.service.removeBlock(user.id, id);
    }

    // ── Slots disponibles (el padre agenda aquí) ──────────────────────────────

    @Get('slots/:psychologistId')
    @Roles('padre', 'psicologa', 'admin')
    getSlots(
        @Param('psychologistId', ParseUUIDPipe) psychologistId: string,
        @Query('from') from: string,
        @Query('to') to: string,
    ) {
        return this.service.getAvailableSlots(
            psychologistId,
            new Date(from),
            new Date(to),
        );
    }

    // ── Asignaciones (admin gestiona) ─────────────────────────────────────────

    @Post('assignments/:psychologistId/:studentId')
    @Roles('admin')
    assign(
        @Param('psychologistId', ParseUUIDPipe) psychologistId: string,
        @Param('studentId', ParseUUIDPipe) studentId: string,
    ) {
        return this.service.assignStudent(psychologistId, studentId);
    }

    @Delete('assignments/:psychologistId/:studentId')
    @Roles('admin')
    unassign(
        @Param('psychologistId', ParseUUIDPipe) psychologistId: string,
        @Param('studentId', ParseUUIDPipe) studentId: string,
    ) {
        return this.service.unassignStudent(psychologistId, studentId);
    }

    // Mis alumnos asignados (vista de la psicóloga)
    @Get('my-students')
    @Roles('psicologa')
    getMyStudents(@CurrentUser() user: JwtUser) {
        return this.service.getStudentsOfPsychologist(user.id);
    }

    // Alumnos de una psicóloga específica (vista del admin)
    @Get('assignments/:psychologistId/students')
    @Roles('admin')
    getStudentsOfPsychologist(
        @Param('psychologistId', ParseUUIDPipe) psychologistId: string,
    ) {
        return this.service.getStudentsOfPsychologist(psychologistId);
    }

    // ── Padres del alumno asignado (para agendar citas) ───────────────────────

    @Get('students/:studentId/parents')
    @Roles('psicologa')
    getStudentParents(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @CurrentUser() user: JwtUser,
    ) {
        return this.service.getStudentParents(user.id, studentId);
    }
}