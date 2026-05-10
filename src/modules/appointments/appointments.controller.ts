import {
    Controller, Get, Post, Patch, Put, Delete,
    Body, Param, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
    CreateAppointmentDto, UpdateAppointmentDto,
    CancelAppointmentDto, ListAppointmentsQueryDto,
    ReplaceAvailabilityDto,
} from './dto/appointments.dto.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
    constructor(private readonly service: AppointmentsService) { }

    // ══════════════════════════════════════════════════════════════
    // CRUD DE CITAS
    // ══════════════════════════════════════════════════════════════

    // ── Crear cita ──────────────────────────────────────────────────
    @Post()
    @Roles('admin', 'psicologa', 'docente', 'auxiliar', 'padre', 'alumno')
    create(
        @Body() dto: CreateAppointmentDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.createAppointment({ id: user.id, rol: user.rol }, dto);
    }

    // ── Mis citas (listado del usuario logueado) ────────────────────
    @Get('mine')
    @Roles('admin', 'psicologa', 'docente', 'auxiliar', 'padre', 'alumno')
    listMine(
        @Query() q: ListAppointmentsQueryDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.listMine({ id: user.id, rol: user.rol }, q);
    }

    // ── Citas de un alumno específico ───────────────────────────────
    @Get('student/:studentId')
    @Roles('admin', 'psicologa', 'docente', 'auxiliar')
    listByStudent(
        @Param('studentId', ParseUUIDPipe) studentId: string,
        @Query() q: ListAppointmentsQueryDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.listByStudent({ id: user.id, rol: user.rol }, studentId, q);
    }

    // ══════════════════════════════════════════════════════════════
    // DISPONIBILIDAD / SLOTS  (rutas estáticas ANTES de ':id')
    // ══════════════════════════════════════════════════════════════

    // ── Disponibilidad declarada por el profesional ─────────────────
    @Get('availability/:cuentaId')
    @Roles('admin', 'psicologa', 'docente', 'auxiliar', 'padre', 'alumno')
    getAvailability(
        @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    ) {
        return this.service.getAvailability(cuentaId);
    }

    // ── Slots ya ocupados de un profesional en la semana ───────────
    @Get('slots-taken/:cuentaId')
    @Roles('admin', 'psicologa', 'docente', 'auxiliar', 'padre', 'alumno')
    getSlotsTaken(
        @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
        @Query('date') date: string,
    ) {
        return this.service.getSlotsTaken(cuentaId, date);
    }

    // ── Reemplazar atómicamente toda mi disponibilidad ──────────────
    @Put('availability/bulk')
    @Roles('psicologa', 'docente', 'auxiliar')
    replaceMyAvailability(
        @CurrentUser() user: AuthUser,
        @Body() dto: ReplaceAvailabilityDto,
    ) {
        return this.service.replaceAvailability(user.id, dto.items);
    }

    // ══════════════════════════════════════════════════════════════
    // OPERACIONES POR ID DE CITA  (van AL FINAL para no chocar con
    // las rutas estáticas anteriores)
    // ══════════════════════════════════════════════════════════════

    // ── Detalle ─────────────────────────────────────────────────────
    @Get(':id')
    @Roles('admin', 'psicologa', 'docente', 'auxiliar', 'padre', 'alumno')
    getOne(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getOne({ id: user.id, rol: user.rol }, id);
    }

    // ── Actualizar (estado, reagendar, notas) ───────────────────────
    @Patch(':id')
    @Roles('admin', 'psicologa', 'docente', 'auxiliar', 'padre', 'alumno')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAppointmentDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.updateAppointment({ id: user.id, rol: user.rol }, id, dto);
    }

    // ── Cancelar (acción explícita con motivo) ──────────────────────
    @Delete(':id')
    @Roles('admin', 'psicologa', 'docente', 'auxiliar', 'padre', 'alumno')
    cancel(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CancelAppointmentDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.cancelAppointment({ id: user.id, rol: user.rol }, id, dto);
    }
}