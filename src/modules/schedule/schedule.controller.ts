import {
    Controller, Get, Put, Delete,
    Param, Body, ParseIntPipe, ParseUUIDPipe,
    UseGuards,
} from '@nestjs/common';
// NOTE: seccion_id y periodo_id en BD son UUID (ver entidades section.entity.ts y
// period.entity.ts). Antes se usaba ParseIntPipe acá y reventaba con 400.
import { ScheduleService } from './schedule.service.js';
import { UpsertFranjaDto } from './dto/schedule.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) { }

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
