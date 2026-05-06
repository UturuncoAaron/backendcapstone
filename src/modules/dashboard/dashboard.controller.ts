import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    /**
     * GET /api/dashboard/alumno/resumen
     * Resumen del alumno autenticado (rol alumno) — derivado del JWT.
     */
    @Get('alumno/resumen')
    @Roles('alumno')
    getResumen(@CurrentUser() user: AuthUser) {
        return this.dashboardService.getAlumnoResumen(user.id);
    }

    /**
     * GET /api/dashboard/alumno/:id/resumen
     * Variante administrativa: docente / admin / padre / psicóloga
     * pueden consultar el resumen de un alumno específico.
     * Las restricciones por rol (p. ej. padre solo ve a sus hijos) viven
     * dentro del service.
     */
    @Get('alumno/:id/resumen')
    @Roles('admin', 'docente', 'padre', 'psicologa')
    getResumenById(@Param('id', ParseUUIDPipe) id: string) {
        return this.dashboardService.getAlumnoResumen(id);
    }
}
