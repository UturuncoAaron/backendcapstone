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

    @Get('me')
    @Roles('alumno')
    getMyHorario(@CurrentUser() user: AuthUser) {
        return this.scheduleService.getHorarioForAlumno(user.id);
    }

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

    @Get('section/:seccionId')
    @Roles('admin', 'docente')
    getBySection(
        @Param('seccionId', ParseUUIDPipe) seccionId: string,
        @Query('anio') anio?: string,
    ) {
        const anioFinal = anio ? +anio : new Date().getFullYear();
        return this.scheduleService.getHorarioBySeccion(seccionId, anioFinal);
    }
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