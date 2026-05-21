import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppointmentsService } from './appointments.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

const ALL_ROLES = [
  'alumno',
  'padre',
  'docente',
  'psicologa',
  'admin',
  'auxiliar',
] as const;

/**
 * Exposiciones públicas (autenticadas) de la disponibilidad por rol,
 * según los alias del spec:
 *
 *   GET /psicologas/:psicologaId/disponibilidad
 *   GET /docentes/:docenteId/disponibilidad
 *
 * Devuelven los slots libres/ocupados de la semana indicada por
 * `?weekStart=YYYY-MM-DD` (default = semana actual).
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_ROLES)
export class PublicAvailabilityController {
  constructor(
    private readonly service: AppointmentsService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('psicologas/:psicologaId/disponibilidad')
  async getPsicologaAvailability(
    @Param('psicologaId', ParseUUIDPipe) psicologaId: string,
    @Query('weekStart') weekStart?: string,
  ) {
    await this.assertRole(psicologaId, 'psicologa');
    return this.service.getPublicWeeklyAvailability(psicologaId, weekStart);
  }

  @Get('docentes/:docenteId/disponibilidad')
  async getDocenteAvailability(
    @Param('docenteId', ParseUUIDPipe) docenteId: string,
    @Query('weekStart') weekStart?: string,
  ) {
    await this.assertRole(docenteId, 'docente');
    return this.service.getPublicWeeklyAvailability(docenteId, weekStart);
  }

  /**
   * Disponibilidad pública de un admin/director. Mantenido aparte de
   * `psicologa`/`docente` por simetría con el spec del FE — el padre
   * o alumno puede ver la agenda del admin/director y agendar
   * directamente sobre ella.
   */
  @Get('admins/:adminId/disponibilidad')
  async getAdminAvailability(
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Query('weekStart') weekStart?: string,
  ) {
    await this.assertRole(adminId, 'admin');
    return this.service.getPublicWeeklyAvailability(adminId, weekStart);
  }

  private async assertRole(
    cuentaId: string,
    expectedRol: string,
  ): Promise<void> {
    const rows = await this.dataSource.query<{ rol: string }[]>(
      `SELECT rol::text AS rol FROM cuentas WHERE id = $1 AND activo = TRUE`,
      [cuentaId],
    );
    if (!rows[0]) throw new NotFoundException('Cuenta no encontrada');
    if (rows[0].rol !== expectedRol)
      throw new NotFoundException(`La cuenta no es ${expectedRol}`);
  }
}
