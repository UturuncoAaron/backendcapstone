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
} from './dto/appointments.dto.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  // ══════════════════════════════════════════════════════════════
  // CRUD DE CITAS
  // ══════════════════════════════════════════════════════════════

  // ── Crear cita ──────────────────────────────────────────────────
  // El alumno sólo puede crear cita con psicología (validado en el service).
  // `auxiliar` está excluido: el rol no participa de citas.
  @Post()
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthUser) {
    return this.service.createAppointment({ id: user.id, rol: user.rol }, dto);
  }

  // Reglas por rol (lo consume el FE para configurar el dialog). Devuelve
  // `null` si el target no participa del flujo de citas.
  @Get('rules/:targetId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getRules(@Param('targetId', ParseUUIDPipe) targetId: string) {
    return this.service.getRulesForTarget(targetId);
  }

  // ── Mis citas (listado del usuario logueado) ────────────────────
  @Get('mine')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  listMine(
    @Query() q: ListAppointmentsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listMine({ id: user.id, rol: user.rol }, q);
  }

  // ── Citas de un alumno específico ───────────────────────────────
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
  // DISPONIBILIDAD / SLOTS  (rutas estáticas ANTES de ':id')
  // ══════════════════════════════════════════════════════════════

  // ── Disponibilidad declarada por el profesional ─────────────────
  @Get('availability/:cuentaId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getAvailability(@Param('cuentaId', ParseUUIDPipe) cuentaId: string) {
    return this.service.getAvailability(cuentaId);
  }

  // ── Slots ya ocupados de un profesional en la semana ───────────
  @Get('slots-taken/:cuentaId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getSlotsTaken(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Query('date') date: string,
  ) {
    return this.service.getSlotsTaken(cuentaId, date);
  }

  // ── Slots libres calculados (disponibilidad − ocupados − pasados) ─
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

  // ── Detalle por bloques + sub-slots de un día (drawer/slide-over) ─
  // El calendario macro muestra los bloques generales; al abrir un día
  // se despliega este detalle con los sub-slots de 15/30 min.
  @Get('day-blocks/:cuentaId')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getDayBlocks(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthUser,
  ) {
    // Solo el dueño de la agenda (o admin) ve quién ocupa cada sub-slot.
    const revealOccupants = user.rol === 'admin' || user.id === cuentaId;
    return this.service.getDayBlocks(cuentaId, date, revealOccupants);
  }

  // ── Lista de docentes que el caller puede convocar ─────────────
  // - padre: solo los docentes que dictan cursos a alguno de sus hijos
  //          + tutor(es) de su(s) hijo(s)
  // - psicologa/admin: todos los docentes activos
  // - resto: 403 / vacío
  @Get('teachers/bookable')
  @Roles('padre', 'psicologa', 'admin')
  getBookableTeachers(@CurrentUser() user: AuthUser) {
    return this.service.listBookableTeachers({ id: user.id, rol: user.rol });
  }

  // ── Reemplazar atómicamente toda mi disponibilidad ──────────────
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

  // ── Borrar un bloque individual de disponibilidad ──────────────
  // Si hay citas activas en ese bloque, devuelve 409 a menos que
  // se pase ?confirm=true, en cuyo caso las cancela en cascada y
  // emite notificación a las partes.
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

  // ── Derivación docente → psicóloga ──────────────────────────────
  @Post('derivar')
  @Roles('docente')
  derivar(@Body() dto: DeriveAppointmentDto, @CurrentUser() user: AuthUser) {
    return this.service.deriveToPsicologa({ id: user.id, rol: user.rol }, dto);
  }

  // ══════════════════════════════════════════════════════════════
  // OPERACIONES POR ID DE CITA  (van AL FINAL para no chocar con
  // las rutas estáticas anteriores)
  // ══════════════════════════════════════════════════════════════

  // ── Detalle ─────────────────────────────────────────────────────
  @Get(':id')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getOne({ id: user.id, rol: user.rol }, id);
  }

  // ── Historial de estados (timeline / drawer en el FE) ──────────
  @Get(':id/estado-log')
  @Roles('admin', 'psicologa', 'docente', 'padre', 'alumno')
  getStatusLog(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getStatusLog({ id: user.id, rol: user.rol }, id);
  }

  // ── Actualizar (estado, reagendar, notas) ───────────────────────
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

  // ── Cancelar (acción explícita con motivo) ──────────────────────
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

  // ══════════════════════════════════════════════════════════════
  // RESPUESTA DEL CONVOCADO  (padre / alumno aceptan o rechazan)
  // ══════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════
  // ENDPOINTS CANÓNICOS DEL SPEC (PATCH /:id/<accion>)
  // ══════════════════════════════════════════════════════════════

  @Patch(':id/confirmar')
  @Roles('padre', 'alumno', 'admin', 'docente', 'psicologa')
  confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.acceptAppointment({ id: user.id, rol: user.rol }, id);
  }

  // Spec (Aarón, 2026-05): el alumno NO puede aplazar citas.
  // Sólo puede cancelar con motivo. El guard sirve como primera línea
  // de defensa; el service repite la validación por seguridad.
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

  // ══════════════════════════════════════════════════════════════
  // CIERRE CLÍNICO + SEGUIMIENTO INTELIGENTE (Psicología)
  // ══════════════════════════════════════════════════════════════

  // Sugerencia de fecha de seguimiento + slots libres precargados.
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

  // Cierra la cita (realizada) + ficha clínica + cita de seguimiento, todo
  // en una sola transacción (botón "Guardar Notas y Programar Seguimiento").
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
