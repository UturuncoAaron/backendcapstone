import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    /**
     * GET /api/dashboard/alumno/resumen
     * Producción: usa el JWT del alumno autenticado.
     */
    @Get('alumno/resumen')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('alumno')
    getResumen(@CurrentUser() user: { id: string }) {
        return this.dashboardService.getAlumnoResumen(user.id);  // ← user.id no user.sub
    }

    /**
     * GET /api/dashboard/alumno/:id/resumen
     * Solo disponible en desarrollo para probar sin token.
     * Eliminar o proteger antes de pasar a producción.
     */
    @Get('alumno/:id/resumen')
    getResumenById(@Param('id', ParseUUIDPipe) id: string) {
        return this.dashboardService.getAlumnoResumen(id);
    }
}