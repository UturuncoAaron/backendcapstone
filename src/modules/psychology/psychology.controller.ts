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

@Controller('psychology')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PsychologyController {

    constructor(private readonly service: PsychologyService) { }

    // ── Records (psychologist only) ───────────────────────────────────────────

    @Post('records')
    @Roles('psicologa')
    createRecord(@Body() dto: CreateRecordDto, @CurrentUser() user: any) {
        return this.service.createRecord(user.sub, dto);
    }

    @Get('records/student/:studentId')
    @Roles('psicologa')
    getRecords(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @CurrentUser() user: any,
    ) {
        return this.service.getRecordsByStudent(user.sub, studentId);
    }

    @Patch('records/:id')
    @Roles('psicologa')
    updateRecord(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateRecordDto,
        @CurrentUser() user: any,
    ) {
        return this.service.updateRecord(user.sub, id, dto);
    }

    @Delete('records/:id')
    @Roles('psicologa')
    deleteRecord(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.service.deleteRecord(user.sub, id);
    }

    // ── Appointments ──────────────────────────────────────────────────────────

    @Post('appointments')
    @Roles('psicologa', 'docente')
    createAppointment(@Body() dto: CreateAppointmentDto, @CurrentUser() user: any) {
        return this.service.createAppointment(user.sub, dto);
    }

    @Get('appointments/mine')
    @Roles('psicologa', 'docente')
    getMyAppointments(@CurrentUser() user: any) {
        return this.service.getMyAppointments(user.sub);
    }

    @Get('appointments/parent')
    @Roles('padre')
    getParentAppointments(@CurrentUser() user: any) {
        return this.service.getAppointmentsByParent(user.sub);
    }

    @Get('appointments/student')
    @Roles('alumno')
    getStudentAppointments(@CurrentUser() user: any) {
        return this.service.getAppointmentsByStudent(user.sub);
    }

    @Patch('appointments/:id')
    @Roles('psicologa', 'docente')
    updateAppointment(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAppointmentDto,
        @CurrentUser() user: any,
    ) {
        return this.service.updateAppointment(id, user.sub, dto);
    }

    // ── Availability ──────────────────────────────────────────────────────────

    @Post('availability')
    @Roles('psicologa')
    setAvailability(@Body() dto: CreateAvailabilityDto, @CurrentUser() user: any) {
        return this.service.setAvailability(user.sub, dto);
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
        @CurrentUser() user: any,
    ) {
        return this.service.removeAvailability(user.sub, id);
    }

    // ── Blocks ────────────────────────────────────────────────────────────────

    @Post('blocks')
    @Roles('psicologa')
    createBlock(@Body() dto: CreateBlockDto, @CurrentUser() user: any) {
        return this.service.createBlock(user.sub, dto);
    }

    @Get('blocks')
    @Roles('psicologa')
    getBlocks(@CurrentUser() user: any) {
        return this.service.getBlocks(user.sub);
    }

    @Delete('blocks/:id')
    @Roles('psicologa')
    removeBlock(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.service.removeBlock(user.sub, id);
    }

    // ── Available slots (parent books here) ──────────────────────────────────

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

    // ── Assignments (admin manages) ───────────────────────────────────────────

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

    @Get('my-students')
    @Roles('psicologa')
    getMyStudents(@CurrentUser() user: any) {
        return this.service.getMyStudents(user.sub);
    }

    @Get('assignments/:psychologistId/students')
    @Roles('admin')
    getStudentsOfPsychologist(
        @Param('psychologistId', ParseUUIDPipe) psychologistId: string,
    ) {
        return this.service.getStudentsOfPsychologist(psychologistId);
    }

    // ── Padres del alumno asignado (para programar citas) ─────────────────────

    @Get('students/:studentId/parents')
    @Roles('psicologa')
    getStudentParents(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @CurrentUser() user: any,
    ) {
        return this.service.getStudentParents(user.sub, studentId);
    }
}