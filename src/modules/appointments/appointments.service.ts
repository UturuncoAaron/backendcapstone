import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Brackets, EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Appointment } from './entities/appointment.entity.js';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import { AccountAvailability, DiaSemana } from './entities/account-availability.entity.js';
import { PsychologistStudent } from '../psychology/entities/psychologist-student.entity.js';
import {
  CreateAppointmentDto, UpdateAppointmentDto,
  CancelAppointmentDto, ListAppointmentsQueryDto,
} from './dto/appointments.dto.js';
import {
  AppointmentRecipientRole, APPOINTMENT_RECIPIENT_ROLES,
  ROLES_WITH_AVAILABILITY, RoleWithAvailability,
} from './appointments.types.js';
import {
  AppointmentRole, getAppointmentRule, isDayAllowed,
  formatAllowedDays, resolveAppointmentRole,
} from './appointments.rules.js';
import {
  NOTIFICATION_EVENT_NAMES, AppointmentCreatedEvent,
  AppointmentStatusChangedEvent, AppointmentCancelledEvent,
} from '../notifications/events/notification-events.js';

const WEEK_DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

const DIAS_SEMANA_INDEXED: readonly (DiaSemana | null)[] = [
  null, 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
] as const;

function hasAvailability(rol: string): rol is RoleWithAvailability {
  return (ROLES_WITH_AVAILABILITY as readonly string[]).includes(rol);
}

const MAX_FUTURE_MONTHS = 6;
const MIN_LEAD_MINUTES = 15;

interface CallerContext { id: string; rol: string; }
interface AccountSummary { id: string; rol: string; cargo: string | null; }
interface ProfileRow { id: string; nombre: string; apellido_paterno: string; apellido_materno: string | null; }
interface AppointmentPersonView {
  id: string; nombre: string; apellido_paterno: string;
  apellido_materno: string | null; rol: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment) private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Cuenta) private readonly cuentaRepo: Repository<Cuenta>,
    @InjectRepository(AccountAvailability) private readonly availabilityRepo: Repository<AccountAvailability>,
    @InjectRepository(PsychologistStudent) private readonly assignmentRepo: Repository<PsychologistStudent>,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) { }

  // ════════════════════════════════════════════════════════════════
  // CREATE
  // ════════════════════════════════════════════════════════════════
  //
  // Reglas de negocio:
  //   - Psicóloga  → convoca a alumno o padre (cita directa, confirmada al instante)
  //   - Docente    → convoca a padre (requiere confirmación)
  //   - Director   → convoca a padre (solo mar/jue)
  //   - Padre      → convoca a psicóloga o docente según disponibilidad
  //   - Alumno     → solo puede convocar a la psicóloga (se auto-asigna como studentId)

  async createAppointment(caller: CallerContext, dto: CreateAppointmentDto): Promise<Appointment> {
    const scheduledAt = new Date(dto.scheduledAt);
    this.assertScheduledAtIsValid(scheduledAt);

    // Alumno siempre agenda sobre sí mismo
    if (caller.rol === 'alumno') {
      dto = { ...dto, studentId: caller.id, parentId: undefined };
    }

    if (!dto.studentId && !dto.parentId) {
      throw new BadRequestException('Debe indicar al menos un alumno o un padre/tutor');
    }

    if (caller.id === dto.convocadoAId) {
      throw new BadRequestException('No puedes convocarte a ti mismo');
    }

    const convocadoA = await this.loadAccountSummary(dto.convocadoAId);
    if (!convocadoA) {
      throw new NotFoundException('La cuenta convocada no existe o está inactiva');
    }

    // Solo la psicóloga puede convocar directamente a un alumno
    if (convocadoA.rol === 'alumno' && caller.rol !== 'psicologa') {
      throw new BadRequestException(
        'No se puede convocar directamente a un alumno. Solo la psicóloga puede hacerlo.',
      );
    }

    // Validar que el rol del convocado sea un destinatario permitido
    // (alumno se permite cuando el caller es psicóloga, ya filtrado arriba)
    const isAlumnoConvocadoPorPsicologa = convocadoA.rol === 'alumno' && caller.rol === 'psicologa';
    if (
      !isAlumnoConvocadoPorPsicologa &&
      !APPOINTMENT_RECIPIENT_ROLES.includes(convocadoA.rol as AppointmentRecipientRole)
    ) {
      throw new BadRequestException(`No se puede convocar a un usuario con rol ${convocadoA.rol}`);
    }

    // Alumno solo puede citar a la psicóloga
    if (caller.rol === 'alumno' && convocadoA.rol !== 'psicologa') {
      throw new ForbiddenException(
        'Los alumnos solo pueden agendar citas con la psicóloga.',
      );
    }

    if (dto.studentId) await this.assertCanInvolveStudent(caller, dto.studentId);
    if (dto.parentId && dto.studentId) await this.assertParentBelongsToStudent(dto.parentId, dto.studentId);

    // Cuando la psicóloga convoca a un alumno directamente, las reglas
    // (duración, días permitidos) son las de la psicóloga (el caller),
    // no las del alumno (que no tiene reglas propias).
    const ruleAccount: AccountSummary = isAlumnoConvocadoPorPsicologa
      ? { id: caller.id, rol: caller.rol, cargo: null }
      : convocadoA;

    const role = this.toAppointmentRole(ruleAccount);
    const rule = getAppointmentRule(role);
    const durationMin = this.resolveDuration(role, rule, dto.durationMin);

    if (!isDayAllowed(rule, scheduledAt)) {
      throw new BadRequestException(`${rule.label} atiende solo ${formatAllowedDays(rule)}`);
    }

    // Verificar disponibilidad del convocado (si aplica)
    if (hasAvailability(convocadoA.rol)) {
      await this.assertSlotFitsAvailability(convocadoA.id, scheduledAt, durationMin, undefined, rule.defaultHours);
    }

    // Verificar disponibilidad del convocante (si tiene calendario propio)
    if (hasAvailability(caller.rol) && caller.id !== convocadoA.id) {
      await this.assertSlotFitsAvailability(caller.id, scheduledAt, durationMin);
    }

    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      // Detectar solapamiento para ambas partes
      const conflictIds = [convocadoA.id, caller.id];
      const conflict = await em
        .createQueryBuilder(Appointment, 'a')
        .where('(a.convocado_a_id IN (:...ids) OR a.convocado_por_id IN (:...ids))', { ids: conflictIds })
        .andWhere('a.estado IN (:...states)', { states: ['pendiente', 'confirmada'] })
        .andWhere(
          `tstzrange(a.fecha_hora, a.fecha_hora + (a.duracion_min || ' minutes')::interval, '[)')
           && tstzrange(:start, :end, '[)')`,
          { start: scheduledAt, end: new Date(scheduledAt.getTime() + durationMin * 60_000) },
        )
        .getOne();

      if (conflict) throw new ConflictException('Ese horario ya está ocupado');

      const initialEstado = rule.directBooking ? 'confirmada' : 'pendiente';

      const appointment = em.create(Appointment, {
        createdById: caller.id,
        convocadoAId: convocadoA.id,
        studentId: dto.studentId ?? null,
        parentId: dto.parentId ?? null,
        tipo: dto.tipo,
        modalidad: 'presencial',
        motivo: dto.motivo,
        scheduledAt,
        durationMin,
        estado: initialEstado,
        priorNotes: dto.priorNotes ?? null,
      });
      const saved = await em.save(appointment);

      // Registrar asignación psicóloga-alumno
      if (dto.studentId) {
        if (convocadoA.rol === 'psicologa') await this.upsertPsychologistAssignment(em, convocadoA.id, dto.studentId);
        if (caller.rol === 'psicologa') await this.upsertPsychologistAssignment(em, caller.id, dto.studentId);
      }

      this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CREATED, {
        appointmentId: saved.id,
        createdById: caller.id,
        convocadoAId: convocadoA.id,
        parentId: dto.parentId ?? null,
        studentId: dto.studentId ?? null,
        scheduledAt,
        motivo: dto.motivo,
        convocadoARole: convocadoA.rol,
      } satisfies AppointmentCreatedEvent);

      return saved;
    });
  }

  // ════════════════════════════════════════════════════════════════
  // READ
  // ════════════════════════════════════════════════════════════════

  async listMine(caller: CallerContext, q: ListAppointmentsQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const order = q.order ?? 'DESC';

    const qb = this.baseAppointmentQuery().where(
      new Brackets((qb2) => {
        qb2
          .where('a.convocado_por_id = :id', { id: caller.id })
          .orWhere('a.convocado_a_id = :id', { id: caller.id });
      }),
    );

    if (caller.rol === 'alumno') qb.orWhere('a.alumno_id = :id', { id: caller.id });
    if (q.estado) qb.andWhere('a.estado = :estado', { estado: q.estado });
    if (q.studentId) qb.andWhere('a.alumno_id = :student', { student: q.studentId });
    if (q.from) qb.andWhere('a.fecha_hora >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.fecha_hora <= :to', { to: new Date(q.to) });

    const [items, total] = await qb
      .orderBy('a.scheduledAt', order)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: await this.enrichWithProfileNames(items),
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listByStudent(caller: CallerContext, studentId: string, q: ListAppointmentsQueryDto) {
    if (!['admin', 'psicologa', 'docente', 'auxiliar'].includes(caller.rol)) {
      throw new ForbiddenException('Tu rol no puede ver citas por alumno');
    }

    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const order = q.order ?? 'DESC';

    const qb = this.baseAppointmentQuery().where('a.alumno_id = :studentId', { studentId });
    if (q.estado) qb.andWhere('a.estado = :estado', { estado: q.estado });
    if (q.from) qb.andWhere('a.fecha_hora >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.fecha_hora <= :to', { to: new Date(q.to) });

    const [items, total] = await qb
      .orderBy('a.fecha_hora', order)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: await this.enrichWithProfileNames(items),
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOne(caller: CallerContext, id: string): Promise<Appointment> {
    const appt = await this.baseAppointmentQuery().where('a.id = :id', { id }).getOne();
    if (!appt) throw new NotFoundException('Cita no encontrada');
    this.assertCanRead(caller, appt);
    const [enriched] = await this.enrichWithProfileNames([appt]);
    return enriched;
  }

  // ════════════════════════════════════════════════════════════════
  // UPDATE / CANCEL
  // ════════════════════════════════════════════════════════════════

  async updateAppointment(caller: CallerContext, id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    if (caller.rol !== 'admin' && appt.createdById !== caller.id && appt.convocadoAId !== caller.id) {
      throw new ForbiddenException('No participas en esta cita');
    }

    if (dto.scheduledAt) {
      const newDate = new Date(dto.scheduledAt);
      const newDuration = dto.durationMin ?? appt.durationMin;
      this.assertScheduledAtIsValid(newDate);

      const recipient = await this.cuentaRepo.findOne({ where: { id: appt.convocadoAId }, select: ['id', 'rol'] });
      if (recipient && hasAvailability(recipient.rol)) {
        await this.assertSlotFitsAvailability(recipient.id, newDate, newDuration, appt.id);
      }
      if (hasAvailability(caller.rol) && caller.id !== appt.convocadoAId) {
        await this.assertSlotFitsAvailability(caller.id, newDate, newDuration, appt.id);
      }
      appt.scheduledAt = newDate;
    }

    if (dto.durationMin !== undefined) appt.durationMin = dto.durationMin;
    if (dto.followUpNotes !== undefined) appt.followUpNotes = dto.followUpNotes;
    if (dto.rescheduledFromId !== undefined) {
      if (dto.rescheduledFromId === appt.id) {
        throw new BadRequestException('Una cita no puede ser reagendamiento de sí misma');
      }
      appt.rescheduledFromId = dto.rescheduledFromId;
    }

    let previousStatus: string | null = null;
    if (dto.estado && dto.estado !== appt.estado) {
      this.assertStateTransition(caller, appt, dto.estado);
      previousStatus = appt.estado;
      appt.estado = dto.estado;
      if (dto.estado === 'cancelada') {
        appt.cancelledAt = new Date();
        appt.cancelledById = caller.id;
      }
    }

    const saved = await this.appointmentRepo.save(appt);

    if (previousStatus) {
      this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_STATUS_CHANGED, {
        appointmentId: saved.id,
        actorId: caller.id,
        previousStatus,
        nextStatus: saved.estado,
        notifyAccountIds: this.recipientsOf(saved),
      } satisfies AppointmentStatusChangedEvent);
    }

    return saved;
  }

  async cancelAppointment(caller: CallerContext, id: string, dto: CancelAppointmentDto): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    if (caller.rol !== 'admin' && appt.createdById !== caller.id && appt.convocadoAId !== caller.id) {
      throw new ForbiddenException('No participas en esta cita');
    }
    if (['cancelada', 'rechazada', 'realizada'].includes(appt.estado)) {
      throw new BadRequestException(`No se puede cancelar una cita ${appt.estado}`);
    }

    appt.estado = 'cancelada';
    appt.cancelledAt = new Date();
    appt.cancelledById = caller.id;
    appt.cancelReason = dto.motivo ?? null;
    const saved = await this.appointmentRepo.save(appt);

    this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CANCELLED, {
      appointmentId: saved.id,
      actorId: caller.id,
      reason: dto.motivo ?? null,
      notifyAccountIds: this.recipientsOf(saved),
    } satisfies AppointmentCancelledEvent);

    return saved;
  }

  // ════════════════════════════════════════════════════════════════
  // ACEPTAR / RECHAZAR (convocado responde)
  // ════════════════════════════════════════════════════════════════

  async acceptAppointment(caller: CallerContext, id: string): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id) {
      throw new ForbiddenException('Solo el convocado puede aceptar la cita');
    }
    if (appt.estado !== 'pendiente') {
      throw new BadRequestException(`Solo se pueden aceptar citas pendientes (estado actual: ${appt.estado})`);
    }

    appt.estado = 'confirmada';
    const saved = await this.appointmentRepo.save(appt);

    this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_STATUS_CHANGED, {
      appointmentId: saved.id,
      actorId: caller.id,
      previousStatus: 'pendiente',
      nextStatus: 'confirmada',
      notifyAccountIds: this.recipientsOf(saved),
    } satisfies AppointmentStatusChangedEvent);

    return saved;
  }

  async rejectAppointment(caller: CallerContext, id: string, motivo: string): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id) {
      throw new ForbiddenException('Solo el convocado puede rechazar la cita');
    }
    if (appt.estado !== 'pendiente') {
      throw new BadRequestException(`Solo se pueden rechazar citas pendientes (estado actual: ${appt.estado})`);
    }
    if (!motivo || motivo.trim().length < 3) {
      throw new BadRequestException('Debe indicar un motivo para rechazar la cita');
    }

    appt.estado = 'rechazada';
    appt.cancelledAt = new Date();
    appt.cancelledById = caller.id;
    appt.cancelReason = motivo.trim();
    const saved = await this.appointmentRepo.save(appt);

    this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CANCELLED, {
      appointmentId: saved.id,
      actorId: caller.id,
      reason: motivo.trim(),
      notifyAccountIds: this.recipientsOf(saved),
    } satisfies AppointmentCancelledEvent);

    return saved;
  }

  // ════════════════════════════════════════════════════════════════
  // DISPONIBILIDAD
  // ════════════════════════════════════════════════════════════════

  async getAvailability(cuentaId: string): Promise<AccountAvailability[]> {
    return this.availabilityRepo.find({
      where: { cuentaId, activo: true },
      order: { diaSemana: 'ASC', horaInicio: 'ASC' },
    });
  }

  async getSlotsTaken(cuentaId: string, date: string) {
    if (!date) throw new BadRequestException('El parámetro date es requerido (YYYY-MM-DD)');

    const ref = new Date(date);
    if (isNaN(ref.getTime())) throw new BadRequestException('Formato de fecha inválido, usa YYYY-MM-DD');

    const day = ref.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const citas = await this.appointmentRepo
      .createQueryBuilder('a')
      .select(['a.id', 'a.scheduledAt', 'a.durationMin', 'a.estado'])
      .where('(a.convocado_a_id = :cuentaId OR a.convocado_por_id = :cuentaId)', { cuentaId })
      .andWhere('a.estado IN (:...states)', { states: ['pendiente', 'confirmada'] })
      .andWhere('a.fecha_hora >= :monday', { monday })
      .andWhere('a.fecha_hora <= :sunday', { sunday })
      .getMany();

    return citas.map((c) => ({
      id: c.id, scheduledAt: c.scheduledAt, durationMin: c.durationMin, estado: c.estado,
    }));
  }

  /**
   * Reemplaza la disponibilidad completa del profesional.
   * Si hay citas futuras que ya no encajan en el nuevo horario,
   * se cancelan automáticamente y se notifica a los participantes.
   */
  async replaceAvailability(
    cuentaId: string,
    items: { diaSemana: string; horaInicio: string; horaFin: string }[],
  ): Promise<{ saved: AccountAvailability[]; cancelledCount: number }> {
    return this.dataSource.transaction(async (em) => {
      await em.delete(AccountAvailability, { cuentaId });

      let saved: AccountAvailability[] = [];
      if (items.length > 0) {
        const rows = items.map((it) =>
          em.create(AccountAvailability, {
            cuentaId,
            diaSemana: it.diaSemana as DiaSemana,
            horaInicio: it.horaInicio,
            horaFin: it.horaFin,
            activo: true,
          }),
        );
        saved = await em.save(rows);
      }

      // Cancelar citas futuras que ya no caben en la nueva disponibilidad
      const futureAppts = await em
        .getRepository(Appointment)
        .createQueryBuilder('a')
        .where('a.convocado_a_id = :cuentaId', { cuentaId })
        .andWhere('a.fecha_hora > NOW()')
        .andWhere('a.estado IN (:...states)', { states: ['pendiente', 'confirmada'] })
        .getMany();

      const cancelled: Appointment[] = [];
      for (const appt of futureAppts) {
        if (this.fitsInAvailability(appt, saved)) continue;
        appt.estado = 'cancelada';
        appt.cancelledAt = new Date();
        appt.cancelledById = cuentaId;
        appt.cancelReason = 'Cancelada automáticamente al actualizar la disponibilidad del profesional';
        cancelled.push(appt);
      }

      if (cancelled.length) {
        await em.getRepository(Appointment).save(cancelled);
        for (const c of cancelled) {
          this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CANCELLED, {
            appointmentId: c.id,
            actorId: cuentaId,
            reason: c.cancelReason,
            notifyAccountIds: this.recipientsOf(c),
          } satisfies AppointmentCancelledEvent);
        }
      }

      return { saved, cancelledCount: cancelled.length };
    });
  }

  // Devuelve cuántas citas futuras activas tiene el profesional
  // (usado por el FE para mostrar aviso antes de borrar disponibilidad)
  async countFutureAppointments(cuentaId: string): Promise<number> {
    return this.appointmentRepo
      .createQueryBuilder('a')
      .where('a.convocado_a_id = :cuentaId', { cuentaId })
      .andWhere('a.fecha_hora > NOW()')
      .andWhere('a.estado IN (:...states)', { states: ['pendiente', 'confirmada'] })
      .getCount();
  }

  async getRulesForTarget(targetId?: string): Promise<{
    role: AppointmentRole;
    fixedDurationMin: number | null;
    maxDurationMin: number;
    slotMinutes: number;
    allowedDays: string[];
    defaultHours: { start: string; end: string };
    directBooking: boolean;
    label: string;
  } | null> {
    if (!targetId) return null;
    const acc = await this.loadAccountSummary(targetId);
    if (!acc || acc.rol === 'alumno' || acc.rol === 'padre') return null;
    const role = this.toAppointmentRole(acc);
    const rule = getAppointmentRule(role);
    return {
      role,
      fixedDurationMin: rule.fixedDurationMin,
      maxDurationMin: rule.maxDurationMin,
      slotMinutes: rule.slotMinutes,
      allowedDays: [...rule.allowedDays],
      defaultHours: { ...rule.defaultHours },
      directBooking: rule.directBooking,
      label: rule.label,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════

  private async loadAccountSummary(id: string): Promise<AccountSummary | null> {
    const row = await this.dataSource.query<{ id: string; rol: string; cargo: string | null }[]>(
      `SELECT c.id, c.rol::text AS rol, a.cargo
         FROM cuentas c
         LEFT JOIN admins a ON a.id = c.id
        WHERE c.id = $1 AND c.activo = TRUE
        LIMIT 1`,
      [id],
    );
    return row[0] ?? null;
  }

  private toAppointmentRole(account: AccountSummary): AppointmentRole {
    return resolveAppointmentRole(account.rol as never, account.cargo);
  }

  private resolveDuration(
    role: AppointmentRole,
    rule: ReturnType<typeof getAppointmentRule>,
    requested: number | undefined,
  ): number {
    if (rule.fixedDurationMin !== null) return rule.fixedDurationMin;

    const value = requested ?? rule.slotMinutes;

    if (value < rule.slotMinutes) {
      throw new BadRequestException(
        `La duración mínima para ${rule.label} es ${rule.slotMinutes} min`,
      );
    }
    if (value > rule.maxDurationMin) {
      throw new BadRequestException(
        `Duración máxima permitida para ${rule.label}: ${rule.maxDurationMin} min`,
      );
    }
    if (value % rule.slotMinutes !== 0) {
      throw new BadRequestException(
        `La duración debe ser múltiplo de ${rule.slotMinutes} min para ${rule.label}`,
      );
    }
    return value;
  }

  private recipientsOf(appt: Appointment): string[] {
    const ids = new Set<string>();
    ids.add(appt.createdById);
    ids.add(appt.convocadoAId);
    if (appt.parentId) ids.add(appt.parentId);
    return Array.from(ids);
  }

  private baseAppointmentQuery() {
    return this.appointmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.student', 'student')
      .leftJoinAndSelect('a.parent', 'parent')
      .leftJoinAndSelect('a.createdBy', 'createdBy')
      .leftJoinAndSelect('a.convocadoA', 'convocadoA');
  }

  private assertScheduledAtIsValid(d: Date): void {
    const now = new Date();
    if (d.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) {
      throw new BadRequestException(`La cita debe agendarse con al menos ${MIN_LEAD_MINUTES} minutos de anticipación`);
    }
    const max = new Date();
    max.setMonth(max.getMonth() + MAX_FUTURE_MONTHS);
    if (d > max) throw new BadRequestException(`No se puede agendar a más de ${MAX_FUTURE_MONTHS} meses`);
  }

  private assertCanRead(caller: CallerContext, appt: Appointment): void {
    if (caller.rol === 'admin') return;
    if (appt.createdById === caller.id) return;
    if (appt.convocadoAId === caller.id) return;
    if (caller.rol === 'alumno' && appt.studentId === caller.id) return;
    if (caller.rol === 'padre' && appt.parentId === caller.id) return;
    throw new ForbiddenException('No tienes acceso a esta cita');
  }

  private assertStateTransition(caller: CallerContext, appt: Appointment, next: Appointment['estado']): void {
    if (appt.estado === 'cancelada') {
      throw new BadRequestException('Una cita cancelada no puede cambiar de estado');
    }
    if (next === 'realizada' || next === 'no_asistio') {
      if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id) {
        throw new ForbiddenException('Solo el convocado puede marcar la cita como realizada o no asistió');
      }
    }
  }

  private async assertCanInvolveStudent(caller: CallerContext, studentId: string): Promise<void> {
    switch (caller.rol) {
      case 'admin':
      case 'psicologa':
      case 'docente':
      case 'auxiliar':
        return;

      case 'padre': {
        const linked = await this.dataSource.query<unknown[]>(
          `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2 LIMIT 1`,
          [caller.id, studentId],
        );
        if (!linked.length) throw new ForbiddenException('Ese alumno no está vinculado a tu cuenta');
        return;
      }

      case 'alumno':
        if (caller.id !== studentId) throw new ForbiddenException('Un alumno solo puede agendar citas sobre sí mismo');
        return;

      default:
        throw new ForbiddenException(`Tu rol (${caller.rol}) no puede crear citas`);
    }
  }

  private async assertParentBelongsToStudent(parentId: string, studentId: string): Promise<void> {
    const linked = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2 LIMIT 1`,
      [parentId, studentId],
    );
    if (!linked.length) throw new BadRequestException('Ese padre no corresponde al alumno indicado');
  }

  private async assertSlotFitsAvailability(
    cuentaId: string,
    start: Date,
    durationMin: number,
    ignoreAppointmentId?: string,
    fallback?: { start: string; end: string },
  ): Promise<void> {
    const end = new Date(start.getTime() + durationMin * 60_000);
    const dayName = WEEK_DAYS[start.getDay()];

    if (dayName === 'domingo') throw new BadRequestException('No se atiende los domingos');

    const bloques = await this.availabilityRepo.find({
      where: { cuentaId, diaSemana: dayName as DiaSemana, activo: true },
      order: { horaInicio: 'ASC' },
    });

    const virtualBlocks =
      bloques.length > 0
        ? bloques.map((d) => ({ horaInicio: d.horaInicio, horaFin: d.horaFin }))
        : fallback
          ? [{ horaInicio: fallback.start, horaFin: fallback.end }]
          : [];

    if (!virtualBlocks.length) throw new BadRequestException('El profesional no tiene disponibilidad ese día');

    const fits = virtualBlocks.some((d) => {
      const [hS, mS] = d.horaInicio.split(':').map(Number);
      const [hE, mE] = d.horaFin.split(':').map(Number);
      const dayStart = new Date(start); dayStart.setHours(hS, mS, 0, 0);
      const dayEnd = new Date(start); dayEnd.setHours(hE, mE, 0, 0);
      return start >= dayStart && end <= dayEnd;
    });

    if (!fits) {
      const ranges = virtualBlocks.map((d) => `${d.horaInicio} - ${d.horaFin}`).join(', ');
      throw new BadRequestException(`Horario fuera de la disponibilidad (${ranges})`);
    }

    const overlapQB = this.appointmentRepo
      .createQueryBuilder('a')
      .where('(a.convocado_a_id = :cuentaId OR a.convocado_por_id = :cuentaId)', { cuentaId })
      .andWhere('a.estado IN (:...states)', { states: ['pendiente', 'confirmada'] })
      .andWhere(
        `tstzrange(a.fecha_hora, a.fecha_hora + (a.duracion_min || ' minutes')::interval, '[)')
         && tstzrange(:start, :end, '[)')`,
        { start, end },
      );

    if (ignoreAppointmentId) overlapQB.andWhere('a.id <> :ignoreId', { ignoreId: ignoreAppointmentId });

    const overlap = await overlapQB.getCount();
    if (overlap > 0) throw new ConflictException('Ese horario ya está ocupado');
  }

  private async upsertPsychologistAssignment(em: EntityManager, psychologistId: string, studentId: string): Promise<void> {
    await em.query(
      `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde)
       VALUES ($1, $2, TRUE, CURRENT_DATE)
       ON CONFLICT (psicologa_id, alumno_id)
       DO UPDATE SET activo = TRUE, hasta = NULL`,
      [psychologistId, studentId],
    );
  }

  private fitsInAvailability(appt: Appointment, availability: AccountAvailability[]): boolean {
    if (!availability.length) return false;
    const dt = new Date(appt.scheduledAt);
    const dia = DIAS_SEMANA_INDEXED[dt.getDay()];
    if (!dia) return false;
    const startMin = dt.getHours() * 60 + dt.getMinutes();
    const endMin = startMin + (appt.durationMin ?? 30);
    return availability.some((a) => {
      if (a.diaSemana !== dia) return false;
      const [hI, mI] = a.horaInicio.split(':').map(Number);
      const [hF, mF] = a.horaFin.split(':').map(Number);
      return startMin >= hI * 60 + mI && endMin <= hF * 60 + mF;
    });
  }

  private async enrichWithProfileNames(items: Appointment[]): Promise<Appointment[]> {
    if (!items.length) return items;

    const ids = new Set<string>();
    for (const a of items) {
      if (a.convocadoAId) ids.add(a.convocadoAId);
      if (a.createdById) ids.add(a.createdById);
    }
    if (!ids.size) return items;

    const rows = await this.dataSource.query<ProfileRow[]>(
      `SELECT id, nombre, apellido_paterno, apellido_materno FROM psicologas WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM alumnos    WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM padres     WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM docentes   WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM auxiliares WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM admins     WHERE id = ANY($1::uuid[])`,
      [Array.from(ids)],
    );

    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const a of items) {
      const target = a as unknown as Record<string, AppointmentPersonView | null>;

      if (a.convocadoAId && a.convocadoA) {
        const profile = byId.get(a.convocadoAId);
        if (profile) {
          Object.assign(a.convocadoA as unknown as Record<string, unknown>, {
            nombre: profile.nombre,
            apellido_paterno: profile.apellido_paterno,
            apellido_materno: profile.apellido_materno,
          });
        }
      }

      if (a.createdById && a.createdBy) {
        const profile = byId.get(a.createdById);
        target['convocadoPor'] = {
          id: a.createdBy.id, rol: a.createdBy.rol,
          nombre: profile?.nombre ?? '',
          apellido_paterno: profile?.apellido_paterno ?? '',
          apellido_materno: profile?.apellido_materno ?? null,
        };
      } else {
        target['convocadoPor'] = null;
      }
    }
    return items;
  }
}