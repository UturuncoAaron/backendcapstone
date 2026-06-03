import {
    Controller, Post, Get, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe,
    UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';

import { FichajeService } from './fichaje.service.js';
import {
    FichajeDto, EditarAsistenciaPersonalDto,
    QueryAsistenciaPersonalDto, HorarioLaboralDto,
} from './dto/fichaje.dto.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('fichaje')
export class FichajeController {
    constructor(private readonly fichajeService: FichajeService) { }

    // ── Endpoint público — quiosco ────────────────────────────────────────
    @Post()
    @Public()
    @HttpCode(HttpStatus.OK)
    fichar(@Body() dto: FichajeDto) {
        return this.fichajeService.fichar(dto);
    }

    // ── Admin — ver historial de asistencias ──────────────────────────────
    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    findAll(@Query() query: QueryAsistenciaPersonalDto) {
        return this.fichajeService.findAll(query);
    }

    // ── Admin — editar un registro ────────────────────────────────────────
    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @HttpCode(HttpStatus.OK)
    editar(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: EditarAsistenciaPersonalDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.fichajeService.editarAsistencia(id, dto, user.id);
    }

    // ── Admin — ver horarios laborales de una cuenta ──────────────────────
    @Get('horarios/:cuentaId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    getHorarios(@Param('cuentaId', ParseUUIDPipe) cuentaId: string) {
        return this.fichajeService.getHorariosLaborales(cuentaId);
    }

    // ── Admin — crear/actualizar un horario laboral ───────────────────────
    @Post('horarios/:cuentaId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    upsertHorario(
        @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
        @Body() dto: HorarioLaboralDto,
    ) {
        return this.fichajeService.upsertHorarioLaboral(cuentaId, dto);
    }

    // ── Admin — eliminar un horario laboral ───────────────────────────────
    @Delete('horarios/:cuentaId/:dia')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @HttpCode(HttpStatus.OK)
    deleteHorario(
        @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
        @Param('dia') dia: string,
    ) {
        return this.fichajeService.deleteHorarioLaboral(cuentaId, dia);
    }
}