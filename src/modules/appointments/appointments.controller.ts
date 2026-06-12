import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  ListAppointmentsQueryDto,
  ReplaceAvailabilityDto,
  RejectAppointmentDto,
  MotivoDto,
  PostponeAppointmentDto,
  DeriveAppointmentDto,
  CompleteAppointmentDto,
  CloseSessionDto,
  ReplaceOverridesDto,
} from './dto/appointments.dto.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) { }

  // ══════════════════════════════════════════════════════════════
  // CRUD DE CITAS
  // ══════════════════════════════════════════════════════════════

  @Post()
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthUser) {
    return this.service.createAppointment({ id: user.id, rol: user.rol }, dto);
  }

  @Get('rules/:targetId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getRules(@Param('targetId', ParseUUIDPipe) targetId: string) {
    return this.service.getRulesForTarget(targetId);
  }

  @Get('mine')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  listMine(
    @Query() q: ListAppointmentsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listMine({ id: user.id, rol: user.rol }, q);
  }

  @Get('student/:studentId')
  @Roles('admin', 'psicologa', 'docente')
  listByStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() q: ListAppointmentsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listByStudent(
      { id: user.id, rol: user.rol },
      studentId,
      q,
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DISPONIBILIDAD — RUTAS ESTÁTICAS (antes de ':id')
  // ══════════════════════════════════════════════════════════════

  @Get('availability/:cuentaId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getAvailability(@Param('cuentaId', ParseUUIDPipe) cuentaId: string) {
    return this.service.getAvailability(cuentaId);
  }

  @Get('slots-taken/:cuentaId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getSlotsTaken(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Query('date') date: string,
  ) {
    return this.service.getSlotsTaken(cuentaId, date);
  }

  @Get('free-slots/:cuentaId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getFreeSlots(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Query('date') date: string,
    @Query('slotMinutes') slotMinutes?: string,
  ) {
    return this.service.getFreeSlots(
      cuentaId,
      date,
      slotMinutes ? parseInt(slotMinutes, 10) : undefined,
    );
  }

  @Get('day-blocks/:cuentaId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getDayBlocks(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthUser,
  ) {
    const revealOccupants = user.rol === 'admin' || user.id === cuentaId;
    return this.service.getDayBlocks(cuentaId, date, revealOccupants);
  }

  @Get('teachers/bookable')
  @Roles('padre', 'psicologa', 'admin')
  getBookableTeachers(@CurrentUser() user: AuthUser) {
    return this.service.listBookableTeachers({ id: user.id, rol: user.rol });
  }

  @Get('admins/bookable')
  @Roles('padre', 'psicologa', 'admin')
  getBookableAdmins(@CurrentUser() user: AuthUser) {
    return this.service.listBookableAdmins({ id: user.id, rol: user.rol });
  }

  @Put('availability/bulk')
  @Roles('psicologa', 'docente', 'admin')
  replaceMyAvailability(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReplaceAvailabilityDto,
  ) {
    return this.service.replaceAvailability(user.id, dto.items);
  }

  @Get('count-future')
  @Roles('psicologa', 'docente', 'admin')
  async countFuture(@CurrentUser() user: AuthUser) {
    const count = await this.service.countFutureAppointments(user.id);
    return { count };
  }

  @Delete('availability/slot/:slotId')
  @Roles('psicologa', 'docente', 'admin')
  deleteAvailabilitySlot(
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Query('confirm') confirm: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.deleteAvailabilitySlot(
      { id: user.id, rol: user.rol },
      slotId,
      confirm === 'true',
    );
  }

  // ══════════════════════════════════════════════════════════════
  // OVERRIDES DE DISPONIBILIDAD (por fecha específica)
  // ══════════════════════════════════════════════════════════════

  /**
   * GET /appointments/availability/overrides/:cuentaId?weekStart=YYYY-MM-DD
   * Devuelve los overrides `specific` de la cuenta para la semana indicada.
   */
  @Get('availability/overrides/:cuentaId')
  @Roles('admin', 'psicologa', 'docente')
  getOverridesForWeek(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Query('weekStart') weekStart?: string,
  ) {
    return this.service.getOverridesForWeek(cuentaId, weekStart);
  }

  /**
   * PUT /appointments/availability/overrides/:cuentaId/:date
   * Reemplaza los slots del día `date` con los nuevos. Si `slots` está
   * vacío, el día queda bloqueado. Las citas que no encajan se cancelan.
   */
  @Put('availability/overrides/:cuentaId/:date')
  @Roles('psicologa', 'docente', 'admin')
  replaceOverridesForDate(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Param('date') date: string,
    @Body() dto: ReplaceOverridesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.replaceOverridesForDate(
      { id: user.id, rol: user.rol },
      cuentaId,
      date,
      dto.slots,
    );
  }

  /**
   * DELETE /appointments/availability/overrides/:cuentaId/:date
   * Elimina el override de una fecha → vuelve al horario base `weekly`.
   */
  @Delete('availability/overrides/:cuentaId/:date')
  @Roles('psicologa', 'docente', 'admin')
  deleteOverrideForDate(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Param('date') date: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.deleteOverrideForDate(
      { id: user.id, rol: user.rol },
      cuentaId,
      date,
    );
  }

  @Post('derivar')
  @Roles('docente')
  derivar(@Body() dto: DeriveAppointmentDto, @CurrentUser() user: AuthUser) {
    return this.service.deriveToPsicologa({ id: user.id, rol: user.rol }, dto);
  }

  // ══════════════════════════════════════════════════════════════
  // OPERACIONES POR ID (van AL FINAL)
  // ══════════════════════════════════════════════════════════════

  @Get(':id')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getOne({ id: user.id, rol: user.rol }, id);
  }

  @Get(':id/estado-log')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getStatusLog(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getStatusLog({ id: user.id, rol: user.rol }, id);
  }

  @Patch(':id')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateAppointment(
      { id: user.id, rol: user.rol },
      id,
      dto,
    );
  }

  @Delete(':id')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancelAppointment(
      { id: user.id, rol: user.rol },
      id,
      dto,
    );
  }

  @Post(':id/accept')
  @Roles('padre', 'admin')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.acceptAppointment({ id: user.id, rol: user.rol }, id);
  }

  @Post(':id/reject')
  @Roles('padre', 'admin')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAppointmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rejectAppointment(
      { id: user.id, rol: user.rol },
      id,
      dto.motivo,
    );
  }

  @Patch(':id/confirmar')
  @Roles('padre', 'alumno', 'admin', 'docente', 'psicologa')
  confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.acceptAppointment({ id: user.id, rol: user.rol }, id);
  }

  @Patch(':id/aplazar')
  @Roles('padre', 'admin', 'psicologa', 'docente')
  aplazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostponeAppointmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.postponeAppointment(
      { id: user.id, rol: user.rol },
      id,
      dto,
    );
  }

  @Patch(':id/cancelar')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotivoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancelAppointment({ id: user.id, rol: user.rol }, id, {
      motivo: dto.motivo,
    });
  }

  @Patch(':id/rechazar')
  @Roles('padre', 'admin')
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAppointmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rejectAppointment(
      { id: user.id, rol: user.rol },
      id,
      dto.motivo,
    );
  }

  @Patch(':id/realizar')
  @Roles('psicologa', 'admin')
  realizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteAppointmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.markAsRealizada(
      { id: user.id, rol: user.rol },
      id,
      dto,
    );
  }

  @Patch(':id/inasistencia')
  @Roles('psicologa', 'admin')
  inasistencia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.markAsNoAsistio({ id: user.id, rol: user.rol }, id);
  }

  @Get(':id/seguimiento-sugerido')
  @Roles('psicologa', 'admin')
  followUpSuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getFollowUpSuggestion(
      { id: user.id, rol: user.rol },
      id,
    );
  }

  @Post(':id/cerrar-sesion')
  @Roles('psicologa', 'admin')
  closeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.closeSessionWithFollowUp(
      { id: user.id, rol: user.rol },
      id,
      dto,
    );
  }
}