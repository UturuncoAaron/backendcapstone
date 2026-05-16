import {
    Controller, Get, Put, Delete,
    Param, Body, Query, ParseIntPipe, ParseUUIDPipe,
    UseGuards, ForbiddenException,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service.js';
import { UpsertFranjaDto } from './dto/schedule.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) { }

    /**
     * GET /api/schedule/me
     * Horario del usuario autenticado (alumno: sección matriculada
     * en el periodo activo).
     */
    @Get('me')
    @Roles('alumno')
    getMyHorario(@CurrentUser() user: AuthUser) {
        return this.scheduleService.getHorarioForAlumno(user.id);
    }

    /**
     * GET /api/schedule/alumno/:alumnoId
     * Padre/admin consultan el horario del alumno por ID (con verificación de vínculo).
     */
    @Get('alumno/:alumnoId')
    @Roles('padre', 'admin')
    async getHorarioAlumno(
        @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
        @CurrentUser() user: AuthUser,
    ) {
        if (user.rol === 'padre') {
            const ok = await this.scheduleService.isPadreDeAlumno(user.id, alumnoId);
            if (!ok) throw new ForbiddenException('No tienes acceso al horario de este alumno');
        }
        return this.scheduleService.getHorarioForAlumno(alumnoId);
    }

    /**
     * GET /api/schedule/section/:seccionId/period/:periodoId
     * Returns all courses of a section with their time slots.
     */
    @Get('section/:seccionId/period/:periodoId')
    @Roles('admin', 'docente')
    getBySection(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @Param('periodoId', ParseUUIDPipe) periodoId: string,
    ) {
        return this.scheduleService.getHorarioBySeccion(seccionId, periodoId);
    }

    /**
     * GET /api/schedule/hoy?dia=lunes
     * Devuelve los horarios del día con info de docente y curso.
     * Usado por el auxiliar para registrar asistencia de docentes.
     * Si no se envía ?dia=, se infiere automáticamente el día actual del servidor.
     */
    @Get('hoy')
    @Roles('auxiliar', 'admin')
    getHorarioHoy(@Query('dia') dia?: string) {
        const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const diaFinal = dia ?? DIAS[new Date().getDay()];
        return this.scheduleService.getHorariosByDia(diaFinal);
    }

    /**
     * PUT /api/schedule/course/:cursoId
     * Replaces all slots for a course. Send franjas: [] to clear all.
     */
    @Put('course/:cursoId')
    @Roles('admin')
    upsertSlots(
        @Param('cursoId', ParseUUIDPipe) cursoId: string,
        @Body('slots') slots: UpsertFranjaDto[],
    ) {
        return this.scheduleService.upsertFranjasCurso(cursoId, slots ?? []);
    }

    /**
     * DELETE /api/schedule/slot/:id
     * Deletes a single time slot.
     */
    @Delete('slot/:id')
    @Roles('admin')
    deleteSlot(@Param('id', ParseIntPipe) id: number) {
        return this.scheduleService.deleteFranja(id);
    }
}