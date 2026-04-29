import {
    Controller, Get, Patch, Param, Body,
    ParseUUIDPipe, ParseIntPipe, UseGuards,
    BadRequestException,
} from '@nestjs/common';
import { SemanasService, SEMANAS_POR_CURSO } from './semanas.service.js';
import { ToggleSemanaDto, UpdateSemanaDto } from './dto/semanas.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses/:courseId/semanas')
export class SemanasController {
    constructor(private readonly semanasService: SemanasService) { }

    /** Lista las N semanas del curso (con su config aplicada). El alumno no ve las ocultas. */
    @Get()
    @Roles('alumno', 'docente', 'admin', 'padre')
    async list(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser() user: any,
    ) {
        const semanas = await this.semanasService.listForCourse(courseId);
        return user?.rol === 'alumno' ? semanas.filter((s) => !s.oculta) : semanas;
    }

    @Patch(':semana/toggle')
    @Roles('docente', 'admin')
    toggle(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Param('semana', ParseIntPipe) semana: number,
        @Body() dto: ToggleSemanaDto,
    ) {
        this.assertSemana(semana);
        return this.semanasService.toggle(courseId, semana, dto);
    }

    @Patch(':semana')
    @Roles('docente', 'admin')
    update(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Param('semana', ParseIntPipe) semana: number,
        @Body() dto: UpdateSemanaDto,
    ) {
        this.assertSemana(semana);
        return this.semanasService.update(courseId, semana, dto);
    }

    private assertSemana(semana: number): void {
        if (!Number.isInteger(semana) || semana < 1 || semana > SEMANAS_POR_CURSO) {
            throw new BadRequestException(`Semana fuera de rango (1..${SEMANAS_POR_CURSO})`);
        }
    }
}
