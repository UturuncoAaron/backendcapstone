import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Repository,
  Brackets,
  EntityManager,
  SelectQueryBuilder,
} from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Appointment } from './entities/appointment.entity.js';
import { AppointmentStatusLog } from './entities/appointment-status-log.entity.js';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import {
  AccountAvailability,
  AvailabilityTipo,
  DiaSemana,
} from './entities/account-availability.entity.js';
import { PsychologistStudent } from '../psychology/entities/psychologist-student.entity.js';
import type {
  AppointmentStatus,
  AppointmentType,
} from './appointments.types.js';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  ListAppointmentsQueryDto,
  PostponeAppointmentDto,
  DeriveAppointmentDto,
  CompleteAppointmentDto,
  CloseSessionDto,
} from './dto/appointments.dto.js';
import {
  ROLES_WITH_AVAILABILITY,
  RoleWithAvailability,
  ProfileRow,
} from './appointments.types.js';
import {
  AppointmentRole,
  AppointmentRoleRule,
  getAppointmentRule,
  isDayAllowed,
  formatAllowedDays,
  resolveAppointmentRole,
  canInvite,
  callerRequiresStudent,
  callerOwnsSchedule,
  allowedRecipientsFor,
  resolveInitialStatus,
  getFollowUpIntervalDays,
  CallerRol,
} from './appointments.rules.js';
import {
  NOTIFICATION_EVENT_NAMES,
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
  AppointmentCancelledEvent,
  StudentAbsentEvent,
} from '../notifications/events/notification-events.js';

const WEEK_DAYS = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
] as const;

const DIAS_SEMANA_INDEXED: readonly (DiaSemana | null)[] = [
  null,
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
] as const;

function hasAvailability(rol: string): rol is RoleWithAvailability {
  return (ROLES_WITH_AVAILABILITY as readonly string[]).includes(rol);
}

function normalizeDateOnlyInput(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const localMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const parts = isoMatch
    ? {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      }
    : localMatch
      ? {
          year: Number(localMatch[3]),
          month: Number(localMatch[2]),
          day: Number(localMatch[1]),
        }
      : null;

  if (!parts) return null;

  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  )
    return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseLocalDate(dateStr: string): Date {
  const normalized = normalizeDateOnlyInput(dateStr);
  return normalized ? new Date(normalized + 'T00:00:00') : new Date(NaN);
}

const MAX_FUTURE_MONTHS = 6;
const MIN_LEAD_MINUTES = 15;

interface CallerContext {
  id: string;
  rol: string;
}
interface AccountSummary {
  id: string;
  rol: string;
  cargo: string | null;
}

interface AvailabilityItemInput {
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  tipo?: string;
  fechaEspecifica?: string;
}

interface NormalizedAvailabilityItem {
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  tipo: 'weekly' | 'specific';
  fechaEspecifica: string | null;
}

interface AppointmentPersonView {
  id: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  rol: string;
}

export interface AffectedAppointmentSummary {
  id: string;
  scheduledAt: Date;
  durationMin: number;
  estado: AppointmentStatus;
  motivo: string;
  studentName: string | null;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(AppointmentStatusLog)
    private readonly statusLogRepo: Repository<AppointmentStatusLog>,
    @InjectRepository(Cuenta) private readonly cuentaRepo: Repository<Cuenta>,
    @InjectRepository(AccountAvailability)
    private readonly availabilityRepo: Repository<AccountAvailability>,
    @InjectRepository(PsychologistStudent)
    private readonly assignmentRepo: Repository<PsychologistStudent>,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  private async appendStatusLog(
    appointmentId: string,
    previousStatus: AppointmentStatus | null,
    nextStatus: AppointmentStatus,
    changedById: string | null,
    reason: string | null,
    em?: EntityManager,
  ): Promise<void> {
    try {
      const repo = em
        ? em.getRepository(AppointmentStatusLog)
        : this.statusLogRepo;
      await repo.save(
        repo.create({
          appointmentId,
          previousStatus,
          nextStatus,
          changedById,
          reason,
        }),
      );
    } catch (err) {
      this.logger?.warn?.(
        `appendStatusLog falló para cita ${appointmentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async getStatusLog(caller: CallerContext, appointmentId: string) {
    const appt = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
    });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (
      caller.rol !== 'admin' &&
      appt.createdById !== caller.id &&
      appt.convocadoAId !== caller.id &&
      appt.parentId !== caller.id
    ) {
      throw new ForbiddenException(
        'No tienes acceso al historial de esta cita',
      );
    }

    const rows = await this.dataSource.query<
      Array<{
        id: string;
        previous_status: AppointmentStatus | null;
        next_status: AppointmentStatus;
        changed_by_id: string | null;
        changed_by_nombre: string | null;
        changed_by_apellido_paterno: string | null;
        changed_by_rol: string | null;
        razon: string | null;
        changed_at: Date;
      }>
    >(
      `SELECT
            l.id,
            l.anterior_estado AS previous_status,
            l.nuevo_estado    AS next_status,
            l.changed_by_id,
            COALESCE(al.nombre, d.nombre, p.nombre, ps.nombre, ad.nombre, ax.nombre)
                AS changed_by_nombre,
            COALESCE(al.apellido_paterno, d.apellido_paterno, p.apellido_paterno,
                     ps.apellido_paterno, ad.apellido_paterno, ax.apellido_paterno)
                AS changed_by_apellido_paterno,
            c.rol::text AS changed_by_rol,
            l.razon,
            l.changed_at
         FROM cita_estado_log l
         LEFT JOIN cuentas    c  ON c.id  = l.changed_by_id
         LEFT JOIN alumnos    al ON al.id = c.id
         LEFT JOIN docentes   d  ON d.id  = c.id
         LEFT JOIN padres     p  ON p.id  = c.id
         LEFT JOIN psicologas ps ON ps.id = c.id
         LEFT JOIN admins     ad ON ad.id = c.id
         LEFT JOIN staff      ax ON ax.id = c.id
        WHERE l.cita_id = $1
        ORDER BY l.changed_at ASC, l.id ASC`,
      [appointmentId],
    );

    return rows.map((r) => ({
      id: r.id,
      previousStatus: r.previous_status,
      nextStatus: r.next_status,
      changedById: r.changed_by_id,
      changedByName: r.changed_by_nombre
        ? `${r.changed_by_nombre}${
            r.changed_by_apellido_paterno
              ? ' ' + r.changed_by_apellido_paterno
              : ''
          }`.trim()
        : null,
      changedByRole: r.changed_by_rol,
      reason: r.razon,
      changedAt: r.changed_at,
    }));
  }

  private readonly logger = new Logger(AppointmentsService.name);

  async createAppointment(
    caller: CallerContext,
    dto: CreateAppointmentDto,
  ): Promise<Appointment & { availableParents?: ProfileRow[] }> {
    const scheduledAt = new Date(dto.scheduledAt);
    this.assertScheduledAtIsValid(scheduledAt);

    if (caller.rol === 'alumno')
      dto = { ...dto, studentId: caller.id, parentId: undefined };
    if (caller.rol === 'padre') dto = { ...dto, parentId: caller.id };

    if (caller.id === dto.convocadoAId)
      throw new BadRequestException('No puedes convocarte a ti mismo');

    const convocadoA = await this.loadAccountSummary(dto.convocadoAId);
    if (!convocadoA)
      throw new NotFoundException(
        'La cuenta convocada no existe o está inactiva',
      );

    if (caller.rol === 'padre') {
      const existing = await this.appointmentRepo
        .createQueryBuilder('a')
        .leftJoin(Cuenta, 'cv', 'cv.id = a.convocado_a_id')
        .select(['a.id', 'a.scheduledAt', 'a.convocadoAId'])
        .addSelect('cv.rol::text', 'cv_rol')
        .where('a.convocado_por_id = :id', { id: caller.id })
        .andWhere('a.estado IN (:...states)', {
          states: ['pendiente', 'confirmada'],
        })
        .andWhere('a.fecha_hora > NOW()')
        .andWhere('a.convocado_a_id <> :otherSide', {
          otherSide: dto.convocadoAId,
        })
        .getOne();
      if (existing) {
        throw new ConflictException(
          'Ya tienes una cita pendiente o confirmada con otro profesional. Cancélala o espera a que termine antes de agendar una nueva.',
        );
      }
    }

    if (!canInvite(caller.rol as CallerRol, convocadoA.rol as CallerRol)) {
      const permitidos = allowedRecipientsFor(caller.rol as CallerRol);
      const detalle = permitidos.length
        ? `Tu rol (${caller.rol}) solo puede agendar citas con: ${permitidos.join(', ')}.`
        : `Tu rol (${caller.rol}) no puede crear citas.`;
      throw new ForbiddenException(detalle);
    }

    if (callerRequiresStudent(caller.rol as CallerRol) && !dto.studentId)
      throw new BadRequestException(
        'Debes indicar el alumno al que corresponde la cita',
      );

    if (!dto.studentId && !dto.parentId)
      throw new BadRequestException(
        'Debe indicar al menos un alumno o un padre/tutor',
      );

    let availableParents: ProfileRow[] | undefined;
    if (
      caller.rol === 'psicologa' &&
      convocadoA.rol === 'alumno' &&
      dto.studentId &&
      !dto.parentId
    ) {
      const padres = await this.findParentsOfStudent(dto.studentId);
      if (padres.length === 1) dto = { ...dto, parentId: padres[0].id };
      else if (padres.length > 1) availableParents = padres;
    }

    if (dto.studentId)
      await this.assertCanInvolveStudent(caller, dto.studentId);
    if (dto.parentId && dto.studentId)
      await this.assertParentBelongsToStudent(dto.parentId, dto.studentId);
    if (convocadoA.rol === 'psicologa' && dto.studentId)
      await this.warnIfPsicologaNotLinked(convocadoA.id, dto.studentId);
    if (caller.rol === 'psicologa' && dto.studentId)
      await this.warnIfPsicologaNotLinked(caller.id, dto.studentId);
    const callerHasSchedule = callerOwnsSchedule(caller.rol as CallerRol);
    const ruleAccount: AccountSummary = callerHasSchedule
      ? { id: caller.id, rol: caller.rol, cargo: null }
      : convocadoA;

    const role = this.toAppointmentRole(ruleAccount);
    const rule = getAppointmentRule(role);
    const durationMin = this.resolveDuration(rule, dto.durationMin);

    if (!isDayAllowed(rule, scheduledAt))
      throw new BadRequestException(
        `${rule.label} atiende solo ${formatAllowedDays(rule)}`,
      );

    if (hasAvailability(convocadoA.rol))
      await this.assertSlotFitsAvailability(
        convocadoA.id,
        scheduledAt,
        durationMin,
        undefined,
        rule.defaultHours,
        rule.attentionEnd,
      );

    if (hasAvailability(caller.rol) && caller.id !== convocadoA.id)
      await this.assertSlotFitsAvailability(
        caller.id,
        scheduledAt,
        durationMin,
        undefined,
        undefined,
        rule.attentionEnd,
      );

    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const conflictIds = [convocadoA.id, caller.id];
      const conflict = await em
        .createQueryBuilder(Appointment, 'a')
        .where(
          '(a.convocado_a_id IN (:...ids) OR a.convocado_por_id IN (:...ids))',
          { ids: conflictIds },
        )
        .andWhere('a.estado IN (:...states)', {
          states: ['pendiente', 'confirmada'],
        })
        .andWhere(
          `tstzrange(a.fecha_hora, a.fecha_hora + (a.duracion_min || ' minutes')::interval, '[)')
           && tstzrange(:start, :end, '[)')`,
          {
            start: scheduledAt,
            end: new Date(scheduledAt.getTime() + durationMin * 60_000),
          },
        )
        .getOne();

      if (conflict) throw new ConflictException('Ese horario ya está ocupado');

      const initialStatus = resolveInitialStatus({
        caller: caller.rol as CallerRol,
        recipient: convocadoA.rol as CallerRol,
        hasStudent: !!dto.studentId,
        hasParent: !!dto.parentId,
      });

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
        estado: initialStatus,
        priorNotes: dto.priorNotes ?? null,
      });
      const saved = await em.save(appointment);
      if (
        caller.rol === 'psicologa' &&
        convocadoA.rol === 'alumno' &&
        !dto.parentId
      ) {
        await this.blockSpecificAvailabilityRange(
          em,
          caller.id,
          scheduledAt,
          durationMin,
        );
      }
      await this.appendStatusLog(
        saved.id,
        null,
        saved.estado,
        caller.id,
        null,
        em,
      );

      if (dto.studentId) {
        if (convocadoA.rol === 'psicologa')
          await this.upsertPsychologistAssignment(
            em,
            convocadoA.id,
            dto.studentId,
          );
        if (caller.rol === 'psicologa')
          await this.upsertPsychologistAssignment(em, caller.id, dto.studentId);
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

      if (availableParents) {
        (
          saved as Appointment & { availableParents?: ProfileRow[] }
        ).availableParents = availableParents;
      }
      return saved;
    });
  }

  private async autoFinalizePastAppointments(): Promise<void> {
    try {
      await this.appointmentRepo.query(
        `UPDATE citas
           SET estado = 'realizada'
         WHERE estado = 'confirmada'
           AND (fecha_hora + (duracion_min || ' minutes')::interval) < NOW()`,
      );
      await this.appointmentRepo.query(
        `UPDATE citas
           SET estado = 'no_asistio',
               cancelled_at = NOW(),
               cancel_reason = COALESCE(cancel_reason, 'Cita vencida sin confirmar')
         WHERE estado = 'pendiente'
           AND (fecha_hora + (duracion_min || ' minutes')::interval) < NOW()`,
      );
    } catch (err) {
      this.logger?.warn?.(
        `autoFinalizePastAppointments falló: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async listMine(caller: CallerContext, q: ListAppointmentsQueryDto) {
    await this.autoFinalizePastAppointments();
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const order = q.order ?? 'DESC';

    const applyFilters = (qb: SelectQueryBuilder<Appointment>) => {
      qb.where(
        new Brackets((w) => {
          w.where('a.convocado_por_id = :id', { id: caller.id }).orWhere(
            'a.convocado_a_id = :id',
            { id: caller.id },
          );
        }),
      );
      if (caller.rol === 'alumno')
        qb.orWhere('a.alumno_id = :id', { id: caller.id });
      if (q.estado) qb.andWhere('a.estado = :estado', { estado: q.estado });
      if (q.studentId)
        qb.andWhere('a.alumno_id = :student', { student: q.studentId });
      if (q.from)
        qb.andWhere('a.fecha_hora >= :from', { from: new Date(q.from) });
      if (q.to) qb.andWhere('a.fecha_hora <= :to', { to: new Date(q.to) });
      return qb;
    };

    const total = await applyFilters(
      this.appointmentRepo.createQueryBuilder('a'),
    ).getCount();
    if (!total) return { data: [], total: 0, page, limit, totalPages: 0 };

    const idRows = await applyFilters(
      this.appointmentRepo.createQueryBuilder('a').select('a.id'),
    )
      .orderBy('a.fecha_hora', order)
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const ids = idRows.map((r) => r.id);
    if (!ids.length)
      return {
        data: [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };

    const items = await this.baseAppointmentQuery()
      .where('a.id IN (:...ids)', { ids })
      .orderBy('a.fecha_hora', order)
      .getMany();

    return {
      data: await this.enrichWithProfileNames(items),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listByStudent(
    caller: CallerContext,
    studentId: string,
    q: ListAppointmentsQueryDto,
  ) {
    if (!['admin', 'psicologa', 'docente', 'staff'].includes(caller.rol))
      throw new ForbiddenException('Tu rol no puede ver citas por alumno');

    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const order = q.order ?? 'DESC';

    const applyFilters = (qb: SelectQueryBuilder<Appointment>) => {
      qb.where('a.alumno_id = :studentId', { studentId });
      if (q.estado) qb.andWhere('a.estado = :estado', { estado: q.estado });
      if (q.from)
        qb.andWhere('a.fecha_hora >= :from', { from: new Date(q.from) });
      if (q.to) qb.andWhere('a.fecha_hora <= :to', { to: new Date(q.to) });
      return qb;
    };

    const total = await applyFilters(
      this.appointmentRepo.createQueryBuilder('a'),
    ).getCount();
    if (!total) return { data: [], total: 0, page, limit, totalPages: 0 };

    const idRows = await applyFilters(
      this.appointmentRepo.createQueryBuilder('a').select('a.id'),
    )
      .orderBy('a.fecha_hora', order)
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const ids = idRows.map((r) => r.id);
    if (!ids.length)
      return {
        data: [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };

    const items = await this.baseAppointmentQuery()
      .where('a.id IN (:...ids)', { ids })
      .orderBy('a.fecha_hora', order)
      .getMany();

    return {
      data: await this.enrichWithProfileNames(items),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOne(caller: CallerContext, id: string): Promise<Appointment> {
    const appt = await this.baseAppointmentQuery()
      .where('a.id = :id', { id })
      .getOne();
    if (!appt) throw new NotFoundException('Cita no encontrada');
    this.assertCanRead(caller, appt);
    const [enriched] = await this.enrichWithProfileNames([appt]);
    return enriched;
  }

  async updateAppointment(
    caller: CallerContext,
    id: string,
    dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    if (
      caller.rol !== 'admin' &&
      appt.createdById !== caller.id &&
      appt.convocadoAId !== caller.id
    )
      throw new ForbiddenException('No participas en esta cita');

    if (dto.scheduledAt) {
      const newDate = new Date(dto.scheduledAt);
      const newDuration = dto.durationMin ?? appt.durationMin;
      this.assertScheduledAtIsValid(newDate);
      const recipient = await this.cuentaRepo.findOne({
        where: { id: appt.convocadoAId },
        select: ['id', 'rol'],
      });
      if (recipient && hasAvailability(recipient.rol))
        await this.assertSlotFitsAvailability(
          recipient.id,
          newDate,
          newDuration,
          appt.id,
        );
      if (hasAvailability(caller.rol) && caller.id !== appt.convocadoAId)
        await this.assertSlotFitsAvailability(
          caller.id,
          newDate,
          newDuration,
          appt.id,
        );
      appt.scheduledAt = newDate;
    }

    if (dto.durationMin !== undefined) appt.durationMin = dto.durationMin;
    if (dto.followUpNotes !== undefined) appt.followUpNotes = dto.followUpNotes;
    if (dto.rescheduledFromId !== undefined) {
      if (dto.rescheduledFromId === appt.id)
        throw new BadRequestException(
          'Una cita no puede ser reagendamiento de sí misma',
        );
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
      await this.appendStatusLog(
        saved.id,
        previousStatus as AppointmentStatus,
        saved.estado,
        caller.id,
        null,
      );
    }
    return saved;
  }

  async cancelAppointment(
    caller: CallerContext,
    id: string,
    dto: CancelAppointmentDto,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (
      caller.rol !== 'admin' &&
      appt.createdById !== caller.id &&
      appt.convocadoAId !== caller.id
    )
      throw new ForbiddenException('No participas en esta cita');
    if (['cancelada', 'rechazada', 'realizada'].includes(appt.estado))
      throw new BadRequestException(
        `No se puede cancelar una cita ${appt.estado}`,
      );

    const motivo = (dto.motivo ?? '').trim();
    if (motivo.length < 3)
      throw new BadRequestException(
        'Debes indicar un motivo de cancelación (mín. 3 caracteres)',
      );

    const previousStatus = appt.estado;
    appt.estado = 'cancelada';
    appt.cancelledAt = new Date();
    appt.cancelledById = caller.id;
    appt.cancelReason = motivo;
    const saved = await this.appointmentRepo.save(appt);

    this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CANCELLED, {
      appointmentId: saved.id,
      actorId: caller.id,
      reason: motivo,
      notifyAccountIds: this.recipientsOf(saved),
    } satisfies AppointmentCancelledEvent);
    await this.appendStatusLog(
      saved.id,
      previousStatus,
      'cancelada',
      caller.id,
      motivo,
    );
    return saved;
  }

  async acceptAppointment(
    caller: CallerContext,
    id: string,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (appt.estado !== 'pendiente')
      throw new BadRequestException(
        `Solo se pueden aceptar citas pendientes (estado actual: ${appt.estado})`,
      );

    const lastPostpone = await this.statusLogRepo.findOne({
      where: { appointmentId: id, nextStatus: 'pendiente' },
      order: { changedAt: 'DESC' },
    });
    const postponedBySelf =
      lastPostpone &&
      lastPostpone.changedById &&
      lastPostpone.changedById === caller.id &&
      lastPostpone.previousStatus !== null;
    if (postponedBySelf)
      throw new ForbiddenException(
        'No puedes confirmar un aplazamiento que tú mismo propusiste — debe aceptarlo la otra parte de la cita.',
      );

    const isConvocador = appt.createdById === caller.id;
    const isConvocado = appt.convocadoAId === caller.id;
    const isParent = appt.parentId !== null && appt.parentId === caller.id;
    const lastPostponeByConvocado =
      lastPostpone &&
      lastPostpone.changedById === appt.convocadoAId &&
      lastPostpone.previousStatus !== null;

    const canAccept =
      caller.rol === 'admin' ||
      isConvocado ||
      isParent ||
      (lastPostponeByConvocado && isConvocador);
    if (!canAccept)
      throw new ForbiddenException(
        'Solo la parte convocada o admin puede confirmar la cita',
      );

    appt.estado = 'confirmada';
    const saved = await this.appointmentRepo.save(appt);
    this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_STATUS_CHANGED, {
      appointmentId: saved.id,
      actorId: caller.id,
      previousStatus: 'pendiente',
      nextStatus: 'confirmada',
      notifyAccountIds: this.recipientsOf(saved),
    } satisfies AppointmentStatusChangedEvent);
    await this.appendStatusLog(
      saved.id,
      'pendiente',
      'confirmada',
      caller.id,
      null,
    );
    return saved;
  }

  async rejectAppointment(
    caller: CallerContext,
    id: string,
    motivo: string,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    const isParent = appt.parentId !== null && appt.parentId === caller.id;
    if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id && !isParent)
      throw new ForbiddenException(
        'Solo el convocado o el padre/tutor puede rechazar la cita',
      );
    if (appt.estado !== 'pendiente')
      throw new BadRequestException(
        `Solo se pueden rechazar citas pendientes (estado actual: ${appt.estado})`,
      );
    if (!motivo || motivo.trim().length < 3)
      throw new BadRequestException(
        'Debe indicar un motivo para rechazar la cita',
      );

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
    await this.appendStatusLog(
      saved.id,
      'pendiente',
      'rechazada',
      caller.id,
      motivo.trim(),
    );
    return saved;
  }

  async postponeAppointment(
    caller: CallerContext,
    id: string,
    dto: PostponeAppointmentDto,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    if (caller.rol === 'alumno')
      throw new ForbiddenException(
        'El alumno no puede aplazar una cita. Si necesitas cambiarla, cancélala y vuelve a agendarla.',
      );

    const isAdmin = caller.rol === 'admin';
    const isConvocador = appt.createdById === caller.id;
    const isConvocado = appt.convocadoAId === caller.id;
    if (!isAdmin && !isConvocador && !isConvocado)
      throw new ForbiddenException(
        'Solo el convocador, el convocado o admin pueden aplazar esta cita',
      );

    if (!['pendiente', 'confirmada'].includes(appt.estado))
      throw new BadRequestException(
        `No se puede aplazar una cita ${appt.estado}`,
      );
    if (!dto.motivo || dto.motivo.trim().length < 3)
      throw new BadRequestException(
        'Debe indicar un motivo para aplazar la cita',
      );

    const nuevaFecha = new Date(dto.nuevaFechaHora);
    this.assertScheduledAtIsValid(nuevaFecha);

    const convocadorAccount = await this.loadAccountSummary(appt.createdById);
    if (convocadorAccount && hasAvailability(convocadorAccount.rol)) {
      const convocadorRule = getAppointmentRule(
        this.toAppointmentRole(convocadorAccount),
      );
      if (!isDayAllowed(convocadorRule, nuevaFecha))
        throw new BadRequestException(
          `${convocadorRule.label} atiende solo ${formatAllowedDays(convocadorRule)}`,
        );
      await this.assertSlotFitsAvailability(
        convocadorAccount.id,
        nuevaFecha,
        appt.durationMin,
        appt.id,
        convocadorRule.defaultHours,
        convocadorRule.attentionEnd,
      );
    }

    const previousScheduled = appt.scheduledAt;
    const previousStatus = appt.estado;

    appt.scheduledAt = nuevaFecha;
    appt.estado = 'pendiente';
    const actorLabel = isConvocador
      ? `convocador (${caller.rol})`
      : isConvocado
        ? `convocado (${caller.rol})`
        : `admin (${caller.rol})`;
    const nota = `[Aplazada por ${actorLabel} el ${new Date().toISOString()}] Motivo: ${dto.motivo.trim()}. Fecha previa: ${previousScheduled.toISOString()}.`;
    appt.priorNotes = appt.priorNotes ? `${appt.priorNotes}\n${nota}` : nota;

    const saved = await this.appointmentRepo.save(appt);
    this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_STATUS_CHANGED, {
      appointmentId: saved.id,
      actorId: caller.id,
      previousStatus,
      nextStatus: 'pendiente',
      notifyAccountIds: this.recipientsOf(saved),
    } satisfies AppointmentStatusChangedEvent);
    await this.appendStatusLog(
      saved.id,
      previousStatus,
      'pendiente',
      caller.id,
      `Aplazada por ${actorLabel}. ${dto.motivo.trim()}`,
    );
    return saved;
  }

  async markAsRealizada(
    caller: CallerContext,
    id: string,
    dto: CompleteAppointmentDto,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (caller.rol !== 'admin' && caller.rol !== 'psicologa')
      throw new ForbiddenException(
        'Solo la psicóloga (o admin) puede marcar la cita como realizada',
      );
    if (
      caller.rol === 'psicologa' &&
      appt.convocadoAId !== caller.id &&
      appt.createdById !== caller.id
    )
      throw new ForbiddenException(
        'Solo la psicóloga participante puede marcar esta cita',
      );
    if (!['pendiente', 'confirmada'].includes(appt.estado))
      throw new BadRequestException(
        `No se puede marcar como realizada una cita ${appt.estado}`,
      );

    const previousStatus = appt.estado;
    appt.estado = 'realizada';
    if (dto.notasPosteriores !== undefined)
      appt.followUpNotes = dto.notasPosteriores;
    const saved = await this.appointmentRepo.save(appt);

    this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_STATUS_CHANGED, {
      appointmentId: saved.id,
      actorId: caller.id,
      previousStatus,
      nextStatus: 'realizada',
      notifyAccountIds: this.recipientsOf(saved),
    } satisfies AppointmentStatusChangedEvent);
    await this.appendStatusLog(
      saved.id,
      previousStatus,
      'realizada',
      caller.id,
      null,
    );
    return saved;
  }

  async markAsNoAsistio(
    caller: CallerContext,
    id: string,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (caller.rol !== 'admin' && caller.rol !== 'psicologa')
      throw new ForbiddenException(
        'Solo la psicóloga (o admin) puede registrar inasistencia',
      );
    if (
      caller.rol === 'psicologa' &&
      appt.convocadoAId !== caller.id &&
      appt.createdById !== caller.id
    )
      throw new ForbiddenException(
        'Solo la psicóloga participante puede marcar esta cita',
      );
    if (!['pendiente', 'confirmada'].includes(appt.estado))
      throw new BadRequestException(
        `No se puede marcar inasistencia en una cita ${appt.estado}`,
      );

    const previousStatus = appt.estado;
    appt.estado = 'no_asistio';
    const saved = await this.appointmentRepo.save(appt);

    this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_STATUS_CHANGED, {
      appointmentId: saved.id,
      actorId: caller.id,
      previousStatus,
      nextStatus: 'no_asistio',
      notifyAccountIds: this.recipientsOf(saved),
    } satisfies AppointmentStatusChangedEvent);
    await this.appendStatusLog(
      saved.id,
      previousStatus,
      'no_asistio',
      caller.id,
      null,
    );

    if (saved.studentId) {
      const padres = await this.findParentsOfStudent(saved.studentId);
      if (padres.length > 0) {
        const alumno = await this.dataSource.query<ProfileRow[]>(
          `SELECT id, nombre, apellido_paterno, apellido_materno FROM alumnos WHERE id = $1`,
          [saved.studentId],
        );
        const nombreAlumno = alumno[0]
          ? `${alumno[0].nombre} ${alumno[0].apellido_paterno}`.trim()
          : 'Alumno';
        this.events.emit(NOTIFICATION_EVENT_NAMES.STUDENT_ABSENT, {
          alumnoId: saved.studentId,
          alumnoNombre: nombreAlumno,
          fecha: saved.scheduledAt,
          parentAccountIds: padres.map((p) => p.id),
          motivo: 'Inasistencia a cita psicológica',
        } satisfies StudentAbsentEvent);
      }
    }
    return saved;
  }

  async deriveToPsicologa(
    caller: CallerContext,
    dto: DeriveAppointmentDto,
  ): Promise<Appointment> {
    if (caller.rol !== 'docente')
      throw new ForbiddenException(
        'Solo el docente puede derivar a una psicóloga',
      );

    const psicologaSummary = await this.loadAccountSummary(dto.psicologaId);
    if (!psicologaSummary || psicologaSummary.rol !== 'psicologa')
      throw new BadRequestException(
        'La cuenta indicada no es una psicóloga válida',
      );

    const scheduledAt = new Date(dto.scheduledAt);
    this.assertScheduledAtIsValid(scheduledAt);

    const role = this.toAppointmentRole(psicologaSummary);
    const rule = getAppointmentRule(role);
    const durationMin = this.resolveDuration(rule, dto.durationMin);

    if (!isDayAllowed(rule, scheduledAt))
      throw new BadRequestException(
        `${rule.label} atiende solo ${formatAllowedDays(rule)}`,
      );

    await this.assertSlotFitsAvailability(
      psicologaSummary.id,
      scheduledAt,
      durationMin,
      undefined,
      rule.defaultHours,
    );

    const docenteRows = await this.dataSource.query<
      {
        nombre: string;
        apellido_paterno: string;
        apellido_materno: string | null;
      }[]
    >(
      `SELECT nombre, apellido_paterno, apellido_materno FROM docentes WHERE id = $1`,
      [caller.id],
    );
    const docenteNombre = docenteRows[0]
      ? `${docenteRows[0].nombre} ${docenteRows[0].apellido_paterno}${
          docenteRows[0].apellido_materno
            ? ' ' + docenteRows[0].apellido_materno
            : ''
        }`.trim()
      : 'Docente';

    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const conflict = await em
        .createQueryBuilder(Appointment, 'a')
        .where('(a.convocado_a_id = :psi OR a.convocado_por_id = :psi)', {
          psi: psicologaSummary.id,
        })
        .andWhere('a.estado IN (:...states)', {
          states: ['pendiente', 'confirmada'],
        })
        .andWhere(
          `tstzrange(a.fecha_hora, a.fecha_hora + (a.duracion_min || ' minutes')::interval, '[)')
           && tstzrange(:start, :end, '[)')`,
          {
            start: scheduledAt,
            end: new Date(scheduledAt.getTime() + durationMin * 60_000),
          },
        )
        .getOne();
      if (conflict)
        throw new ConflictException(
          'Ese horario ya está ocupado para la psicóloga',
        );
      const appointment = em.create(Appointment, {
        createdById: caller.id,
        convocadoAId: psicologaSummary.id,
        studentId: dto.alumnoId,
        parentId: null,
        tipo: 'psicologico',
        modalidad: 'presencial',
        motivo: dto.motivo,
        scheduledAt,
        durationMin,
        estado: 'confirmada',
        priorNotes: `[Derivación] Derivado por el docente ${docenteNombre}.`,
      });
      const saved = await em.save(appointment);

      await this.blockSpecificAvailabilityRange(
        em,
        psicologaSummary.id,
        scheduledAt,
        durationMin,
      );

      await this.appendStatusLog(
        saved.id,
        null,
        saved.estado,
        caller.id,
        'Derivación docente → psicóloga',
        em,
      );

      await this.upsertPsychologistAssignment(
        em,
        psicologaSummary.id,
        dto.alumnoId,
      );

      this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CREATED, {
        appointmentId: saved.id,
        createdById: caller.id,
        convocadoAId: psicologaSummary.id,
        parentId: null,
        studentId: dto.alumnoId,
        scheduledAt,
        motivo: dto.motivo,
        convocadoARole: 'psicologa',
      } satisfies AppointmentCreatedEvent);

      return saved;
    });
  }

  private async resolvePsychologistOf(
    appt: Appointment,
  ): Promise<string | null> {
    for (const id of [appt.createdById, appt.convocadoAId]) {
      if (!id) continue;
      const acc = await this.loadAccountSummary(id);
      if (acc?.rol === 'psicologa') return acc.id;
    }
    return null;
  }

  private assertPsicologaParticipant(
    caller: CallerContext,
    appt: Appointment,
  ): void {
    if (caller.rol !== 'admin' && caller.rol !== 'psicologa')
      throw new ForbiddenException(
        'Solo la psicóloga (o admin) puede cerrar la sesión',
      );
    if (
      caller.rol === 'psicologa' &&
      appt.convocadoAId !== caller.id &&
      appt.createdById !== caller.id
    )
      throw new ForbiddenException(
        'Solo la psicóloga participante puede cerrar esta cita',
      );
  }

  private toLocalDateStr(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private advanceToAllowedDay(d: Date, rule: AppointmentRoleRule): Date {
    const result = new Date(d);
    for (let i = 0; i < 7; i++) {
      if (isDayAllowed(rule, result)) return result;
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  async getFollowUpSuggestion(caller: CallerContext, appointmentId: string) {
    const appt = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
    });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    this.assertPsicologaParticipant(caller, appt);

    const psychologistId =
      caller.rol === 'psicologa'
        ? caller.id
        : await this.resolvePsychologistOf(appt);
    if (!psychologistId)
      throw new BadRequestException(
        'La cita no tiene una psicóloga asociada para programar seguimiento',
      );

    const rule = getAppointmentRule('psicologa');
    const intervalDays = getFollowUpIntervalDays(appt.tipo);

    const base = new Date(appt.scheduledAt);
    base.setDate(base.getDate() + intervalDays);
    const suggested = this.advanceToAllowedDay(base, rule);
    const suggestedDate = this.toLocalDateStr(suggested);

    const slots = await this.getFreeSlots(psychologistId, suggestedDate);

    const parents = appt.studentId
      ? await this.findParentsOfStudent(appt.studentId)
      : [];

    return {
      appointmentId,
      psychologistId,
      studentId: appt.studentId,
      tipo: appt.tipo,
      intervalDays,
      suggestedDate,
      slotMinutes: rule.slotMinutes,
      maxConsecutiveSlots: rule.maxConsecutiveSlots,
      defaultDurationMin: appt.durationMin || rule.slotMinutes,
      slots,
      parents,
    };
  }

  async closeSessionWithFollowUp(
    caller: CallerContext,
    appointmentId: string,
    dto: CloseSessionDto,
  ): Promise<{ closed: Appointment; followUp: Appointment | null }> {
    const appt = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
    });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    this.assertPsicologaParticipant(caller, appt);
    if (!['pendiente', 'confirmada'].includes(appt.estado))
      throw new BadRequestException(
        `No se puede cerrar una cita en estado ${appt.estado}`,
      );

    const psychologistId =
      caller.rol === 'psicologa'
        ? caller.id
        : await this.resolvePsychologistOf(appt);

    const rule = getAppointmentRule('psicologa');
    let followUpPlan: {
      scheduledAt: Date;
      durationMin: number;
      parentId: string | null;
      tipo: AppointmentType;
      motivo: string;
      estado: AppointmentStatus;
    } | null = null;

    if (dto.seguimiento) {
      if (!psychologistId)
        throw new BadRequestException(
          'La cita no tiene psicóloga asociada para programar seguimiento',
        );
      const seg = dto.seguimiento;
      const scheduledAt = new Date(seg.scheduledAt);
      this.assertScheduledAtIsValid(scheduledAt);
      if (!isDayAllowed(rule, scheduledAt))
        throw new BadRequestException(
          `${rule.label} atiende solo ${formatAllowedDays(rule)}`,
        );
      const durationMin = this.resolveDuration(rule, seg.durationMin);

      let parentId: string | null = null;
      if (seg.incluirPadre) {
        if (seg.parentId) {
          await this.assertParentBelongsToStudent(seg.parentId, appt.studentId);
          parentId = seg.parentId;
        } else {
          const padres = await this.findParentsOfStudent(appt.studentId);
          if (padres.length === 1) parentId = padres[0].id;
          else
            throw new BadRequestException(
              'Debes seleccionar el padre/tutor para la cita de seguimiento',
            );
        }
      }

      await this.assertSlotFitsAvailability(
        psychologistId,
        scheduledAt,
        durationMin,
        undefined,
        rule.defaultHours,
        rule.attentionEnd,
      );

      const estado = resolveInitialStatus({
        caller: 'psicologa',
        recipient: 'alumno',
        hasStudent: true,
        hasParent: !!parentId,
      });

      followUpPlan = {
        scheduledAt,
        durationMin,
        parentId,
        tipo: seg.tipo ?? appt.tipo,
        motivo:
          seg.motivo?.trim() ||
          `Sesión de seguimiento (cita previa ${this.toLocalDateStr(new Date(appt.scheduledAt))})`,
        estado,
      };
    }

    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const current = await em.findOne(Appointment, {
        where: { id: appointmentId },
      });
      if (!current) throw new NotFoundException('Cita no encontrada');
      const previousStatus = current.estado;
      current.estado = 'realizada';
      if (dto.notasPosteriores !== undefined)
        current.followUpNotes = dto.notasPosteriores;
      const closed = await em.save(current);
      await this.appendStatusLog(
        closed.id,
        previousStatus,
        'realizada',
        caller.id,
        'Cierre clínico de sesión',
        em,
      );

      const notas = dto.notasClinicas?.trim();
      if (notas && notas.length > 0 && psychologistId) {
        await em.query(
          `INSERT INTO fichas_psicologia
             (psicologa_id, alumno_id, cita_id, categoria, contenido, es_privada)
           VALUES ($1, $2, $3, $4, $5, TRUE)`,
          [
            psychologistId,
            closed.studentId,
            closed.id,
            this.mapTipoToFichaCategoria(dto.fichaCategoria, closed.tipo),
            notas,
          ],
        );
      }

      let followUp: Appointment | null = null;
      if (followUpPlan && psychologistId) {
        const plan = followUpPlan;
        const conflict = await em
          .createQueryBuilder(Appointment, 'a')
          .where('(a.convocado_a_id = :psi OR a.convocado_por_id = :psi)', {
            psi: psychologistId,
          })
          .andWhere('a.estado IN (:...states)', {
            states: ['pendiente', 'confirmada'],
          })
          .andWhere(
            `tstzrange(a.fecha_hora, a.fecha_hora + (a.duracion_min || ' minutes')::interval, '[)')
             && tstzrange(:start, :end, '[)')`,
            {
              start: plan.scheduledAt,
              end: new Date(
                plan.scheduledAt.getTime() + plan.durationMin * 60_000,
              ),
            },
          )
          .getOne();
        if (conflict)
          throw new ConflictException(
            'El horario de seguimiento ya está ocupado',
          );

        const nueva = em.create(Appointment, {
          createdById: psychologistId,
          convocadoAId: closed.studentId,
          studentId: closed.studentId,
          parentId: plan.parentId,
          tipo: plan.tipo,
          modalidad: 'presencial',
          motivo: plan.motivo,
          scheduledAt: plan.scheduledAt,
          durationMin: plan.durationMin,
          estado: plan.estado,
          rescheduledFromId: null,
          priorNotes: `[Seguimiento] Generado al cerrar la cita ${closed.id}`,
        });
        followUp = await em.save(nueva);
        await this.blockSpecificAvailabilityRange(
          em,
          psychologistId,
          plan.scheduledAt,
          plan.durationMin,
        );
        await this.appendStatusLog(
          followUp.id,
          null,
          followUp.estado,
          caller.id,
          'Cita de seguimiento (cierre clínico)',
          em,
        );
        await this.upsertPsychologistAssignment(
          em,
          psychologistId,
          closed.studentId,
        );

        this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CREATED, {
          appointmentId: followUp.id,
          createdById: psychologistId,
          convocadoAId: closed.studentId,
          parentId: plan.parentId,
          studentId: closed.studentId,
          scheduledAt: plan.scheduledAt,
          motivo: plan.motivo,
          convocadoARole: 'alumno',
        } satisfies AppointmentCreatedEvent);
      }

      this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_STATUS_CHANGED, {
        appointmentId: closed.id,
        actorId: caller.id,
        previousStatus,
        nextStatus: 'realizada',
        notifyAccountIds: this.recipientsOf(closed),
      } satisfies AppointmentStatusChangedEvent);

      return { closed, followUp };
    });
  }

  private mapTipoToFichaCategoria(
    provided: string | undefined,
    tipo: AppointmentType,
  ): string {
    const valid = ['conductual', 'academico', 'familiar', 'emocional', 'otro'];
    if (provided && valid.includes(provided)) return provided;
    const map: Record<string, string> = {
      conductual: 'conductual',
      academico: 'academico',
      familiar: 'familiar',
      psicologico: 'emocional',
      disciplinario: 'conductual',
      otro: 'otro',
    };
    return map[tipo] ?? 'otro';
  }

  async getAvailability(cuentaId: string): Promise<AccountAvailability[]> {
    return this.availabilityRepo.find({
      where: { cuentaId, activo: true },
      order: { diaSemana: 'ASC', horaInicio: 'ASC' },
    });
  }

  async getWeekAvailability(cuentaId: string, weekStart: string) {
    if (!weekStart)
      throw new BadRequestException(
        'El parámetro weekStart es requerido (YYYY-MM-DD)',
      );

    const monday = parseLocalDate(weekStart);
    if (isNaN(monday.getTime()))
      throw new BadRequestException(
        'Formato de fecha inválido para weekStart, usa YYYY-MM-DD o DD/MM/YYYY',
      );
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const allSpecific = await this.availabilityRepo.find({
      where: { cuentaId, activo: true },
      order: { fechaEspecifica: 'ASC', horaInicio: 'ASC' },
    });

    const specificBlocksThisWeek = allSpecific.filter((b) => {
      if (b.tipo !== 'specific' || !b.fechaEspecifica) return false;
      const d = parseLocalDate(b.fechaEspecifica);
      return d >= monday && d <= sunday;
    });

    const diasConEspecifica = new Set<string>();
    for (const b of specificBlocksThisWeek) {
      if (!b.fechaEspecifica) continue;
      const d = parseLocalDate(b.fechaEspecifica);
      const dow = d.getDay();
      const dia = DIAS_SEMANA_INDEXED[dow];
      if (dia) diasConEspecifica.add(dia);
    }

    const allWeekly = await this.availabilityRepo.find({
      where: { cuentaId, activo: true },
      order: { diaSemana: 'ASC', horaInicio: 'ASC' },
    });
    const weeklyBlocksFiltered = allWeekly.filter(
      (b) => b.tipo === 'weekly' && !diasConEspecifica.has(b.diaSemana),
    );

    const appts = await this.appointmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.student', 'student')
      .where(
        '(a.convocado_a_id = :cuentaId OR a.convocado_por_id = :cuentaId)',
        { cuentaId },
      )
      .andWhere('a.estado IN (:...states)', {
        states: ['pendiente', 'confirmada', 'realizada'],
      })
      .andWhere('a.fecha_hora >= :monday', { monday })
      .andWhere('a.fecha_hora <= :sunday', { sunday })
      .getMany();

    return {
      weekStart,
      weeklyBlocks: weeklyBlocksFiltered,
      specificBlocks: specificBlocksThisWeek,
      appointments: appts.map((a) => ({
        id: a.id,
        scheduledAt: a.scheduledAt,
        durationMin: a.durationMin,
        estado: a.estado,
        motivo: a.motivo,
        isFollowUp:
          (a.priorNotes?.toLowerCase().includes('seguimiento') ?? false) ||
          (a.motivo?.toLowerCase().includes('seguimiento') ?? false),
        studentName: a.student
          ? `${a.student.nombre} ${a.student.apellido_paterno ?? ''}`.trim()
          : null,
      })),
    };
  }

  async getSlotsTaken(cuentaId: string, date: string) {
    if (!date)
      throw new BadRequestException(
        'El parámetro date es requerido (YYYY-MM-DD)',
      );

    const ref = parseLocalDate(date);
    if (isNaN(ref.getTime()))
      throw new BadRequestException(
        'Formato de fecha inválido, usa YYYY-MM-DD',
      );

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
      .where(
        '(a.convocado_a_id = :cuentaId OR a.convocado_por_id = :cuentaId)',
        { cuentaId },
      )
      .andWhere('a.estado IN (:...states)', {
        states: ['pendiente', 'confirmada'],
      })
      .andWhere('a.fecha_hora >= :monday', { monday })
      .andWhere('a.fecha_hora <= :sunday', { sunday })
      .getMany();

    return citas.map((c) => ({
      id: c.id,
      scheduledAt: c.scheduledAt,
      durationMin: c.durationMin,
      estado: c.estado,
    }));
  }

  async getFreeSlots(cuentaId: string, date: string, slotMinutes?: number) {
    if (!date)
      throw new BadRequestException(
        'El parámetro date es requerido (YYYY-MM-DD)',
      );

    const ref = parseLocalDate(date);
    if (isNaN(ref.getTime()))
      throw new BadRequestException(
        'Formato de fecha inválido, usa YYYY-MM-DD',
      );

    const dayIdx = ref.getDay();
    if (dayIdx === 0) return [];

    const dayName = WEEK_DAYS[dayIdx] as DiaSemana;
    const account = await this.loadAccountSummary(cuentaId);
    if (!account) throw new NotFoundException('Cuenta no encontrada');

    const role = hasAvailability(account.rol)
      ? this.toAppointmentRole(account)
      : null;
    const rule = role ? getAppointmentRule(role) : null;
    const effectiveSlot = slotMinutes ?? rule?.slotMinutes ?? 30;

    const specificForDate = await this.availabilityRepo.find({
      where: { cuentaId, fechaEspecifica: date, activo: true },
      order: { horaInicio: 'ASC' },
    });

    let bloques: AccountAvailability[];
    if (specificForDate.length > 0) {
      bloques = specificForDate;
    } else {
      bloques = await this.availabilityRepo.find({
        where: {
          cuentaId,
          diaSemana: dayName,
          activo: true,
          tipo: 'weekly' as AvailabilityTipo,
        },
        order: { horaInicio: 'ASC' },
      });
    }

    let ranges: { s: number; e: number }[];
    if (bloques.length > 0) {
      ranges = bloques.map((b) => {
        const [hS, mS] = b.horaInicio.split(':').map(Number);
        const [hE, mE] = b.horaFin.split(':').map(Number);
        return { s: hS * 60 + mS, e: hE * 60 + mE };
      });
    } else if (rule) {
      const [hS, mS] = rule.defaultHours.start.split(':').map(Number);
      const [hE, mE] = rule.defaultHours.end.split(':').map(Number);
      ranges = [{ s: hS * 60 + mS, e: hE * 60 + mE }];
    } else return [];

    ranges.sort((a, b) => a.s - b.s);
    const merged: { s: number; e: number }[] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
      else merged.push({ ...r });
    }

    const cutoffMin = this.cutoffToMinutes(rule?.attentionEnd);
    if (cutoffMin !== null) {
      for (const b of merged) b.e = Math.min(b.e, cutoffMin);
    }

    const dayStart = new Date(ref);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(ref);
    dayEnd.setHours(23, 59, 59, 999);

    const citas = await this.appointmentRepo
      .createQueryBuilder('a')
      .select(['a.id', 'a.scheduledAt', 'a.durationMin'])
      .where(
        '(a.convocado_a_id = :cuentaId OR a.convocado_por_id = :cuentaId)',
        { cuentaId },
      )
      .andWhere('a.estado IN (:...states)', {
        states: ['pendiente', 'confirmada'],
      })
      .andWhere('a.fecha_hora >= :dayStart', { dayStart })
      .andWhere('a.fecha_hora <= :dayEnd', { dayEnd })
      .getMany();

    const occupied = citas.map((c) => {
      const d = new Date(c.scheduledAt);
      const s = d.getHours() * 60 + d.getMinutes();
      return { s, e: s + (c.durationMin ?? 30) };
    });
    const now = new Date();
    const isToday = ref.toDateString() === now.toDateString();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

    const result: { start: string; end: string; available: boolean }[] = [];
    for (const block of merged) {
      for (
        let cursor = block.s;
        cursor + effectiveSlot <= block.e;
        cursor += effectiveSlot
      ) {
        const slotEnd = cursor + effectiveSlot;
        result.push({
          start: toHHMM(cursor),
          end: toHHMM(slotEnd),
          available:
            !(isToday && cursor < nowMinutes + MIN_LEAD_MINUTES) &&
            !occupied.some((o) => cursor < o.e && slotEnd > o.s),
        });
      }
    }
    return result;
  }

  async getDayBlocks(
    cuentaId: string,
    date: string,
    revealOccupants = false,
  ): Promise<{
    cuentaId: string;
    rol: string;
    role: AppointmentRole | null;
    date: string;
    diaSemana: DiaSemana | null;
    slotMinutes: number;
    fixedDurationMin: number | null;
    maxConsecutiveSlots: number;
    attentionEnd: string | null;
    blocks: Array<{
      start: string;
      end: string;
      total: number;
      freeCount: number;
      subSlots: Array<{
        start: string;
        end: string;
        available: boolean;
        appointmentId: string | null;
        occupantLabel: string | null;
      }>;
    }>;
  }> {
    if (!date)
      throw new BadRequestException(
        'El parámetro date es requerido (YYYY-MM-DD)',
      );
    const ref = parseLocalDate(date);
    if (isNaN(ref.getTime()))
      throw new BadRequestException(
        'Formato de fecha inválido, usa YYYY-MM-DD',
      );

    const account = await this.loadAccountSummary(cuentaId);
    if (!account) throw new NotFoundException('Cuenta no encontrada');

    const role = hasAvailability(account.rol)
      ? this.toAppointmentRole(account)
      : null;
    const rule = role ? getAppointmentRule(role) : null;
    const slotMinutes = rule?.slotMinutes ?? 30;

    const dayIdx = ref.getDay();
    const diaSemana = DIAS_SEMANA_INDEXED[dayIdx];

    const empty = {
      cuentaId,
      rol: account.rol,
      role,
      date,
      diaSemana,
      slotMinutes,
      fixedDurationMin: rule?.fixedDurationMin ?? null,
      maxConsecutiveSlots: rule?.maxConsecutiveSlots ?? 1,
      attentionEnd: rule?.attentionEnd ?? null,
      blocks: [],
    };
    if (!diaSemana) return empty;

    const specificForDate = await this.availabilityRepo.find({
      where: { cuentaId, fechaEspecifica: date, activo: true },
      order: { horaInicio: 'ASC' },
    });

    let bloques: AccountAvailability[];
    if (specificForDate.length > 0) {
      bloques = specificForDate;
    } else {
      bloques = await this.availabilityRepo.find({
        where: {
          cuentaId,
          diaSemana,
          activo: true,
          tipo: 'weekly' as AvailabilityTipo,
        },
        order: { horaInicio: 'ASC' },
      });
    }

    const toMin = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    let ranges: { s: number; e: number }[];
    if (bloques.length > 0) {
      ranges = bloques.map((b) => ({
        s: toMin(b.horaInicio),
        e: toMin(b.horaFin),
      }));
    } else if (rule) {
      ranges = [
        { s: toMin(rule.defaultHours.start), e: toMin(rule.defaultHours.end) },
      ];
    } else {
      return empty;
    }

    const cutoffMin = this.cutoffToMinutes(rule?.attentionEnd);
    if (cutoffMin !== null)
      for (const r of ranges) r.e = Math.min(r.e, cutoffMin);
    ranges = ranges
      .filter((r) => r.e - r.s >= slotMinutes)
      .sort((a, b) => a.s - b.s);

    const dayStart = new Date(ref);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(ref);
    dayEnd.setHours(23, 59, 59, 999);

    type OccRow = {
      id: string;
      fecha_hora: Date;
      duracion_min: number;
      motivo: string;
      alumno_nombre: string | null;
      alumno_apellido: string | null;
    };
    const citas = await this.dataSource.query<OccRow[]>(
      `SELECT a.id, a.fecha_hora, a.duracion_min, a.motivo,
              al.nombre AS alumno_nombre, al.apellido_paterno AS alumno_apellido
         FROM citas a
         LEFT JOIN alumnos al ON al.id = a.alumno_id
        WHERE (a.convocado_a_id = $1 OR a.convocado_por_id = $1)
          AND a.estado IN ('pendiente','confirmada')
          AND a.fecha_hora >= $2 AND a.fecha_hora <= $3`,
      [cuentaId, dayStart, dayEnd],
    );
    const occupied = citas.map((c) => {
      const d = new Date(c.fecha_hora);
      const s = d.getHours() * 60 + d.getMinutes();
      return { s, e: s + (c.duracion_min ?? slotMinutes), row: c };
    });

    const now = new Date();
    const isToday = ref.toDateString() === now.toDateString();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

    const blocks = ranges.map((block) => {
      const subSlots: {
        start: string;
        end: string;
        available: boolean;
        appointmentId: string | null;
        occupantLabel: string | null;
      }[] = [];
      for (
        let cursor = block.s;
        cursor + slotMinutes <= block.e;
        cursor += slotMinutes
      ) {
        const slotEnd = cursor + slotMinutes;
        const occ = occupied.find((o) => cursor < o.e && slotEnd > o.s);
        const isPast = isToday && cursor < nowMinutes + MIN_LEAD_MINUTES;
        const available = !occ && !isPast;
        subSlots.push({
          start: toHHMM(cursor),
          end: toHHMM(slotEnd),
          available,
          appointmentId: occ ? occ.row.id : null,
          occupantLabel:
            occ && revealOccupants
              ? `${occ.row.alumno_nombre ?? ''} ${occ.row.alumno_apellido ?? ''}`.trim() ||
                occ.row.motivo.slice(0, 40)
              : null,
        });
      }
      return {
        start: toHHMM(block.s),
        end: toHHMM(block.e),
        total: subSlots.length,
        freeCount: subSlots.filter((s) => s.available).length,
        subSlots,
      };
    });

    return { ...empty, blocks };
  }

  async replaceAvailability(
    cuentaId: string,
    items: AvailabilityItemInput[],
    weekStart?: string,
  ): Promise<{ saved: AccountAvailability[]; cancelledCount: number }> {
    const normalized = (items ?? []).map((it) =>
      this.normalizeAvailabilityItem(it),
    );
    const replacesSpecificWeek =
      !!weekStart || normalized.some((it) => it.tipo === 'specific');
    const weekRange = weekStart ? this.resolveWeekRange(weekStart) : null;

    return this.dataSource.transaction(async (em) => {
      const weeklyItems = normalized.filter((it) => it.tipo === 'weekly');
      const specificItems = normalized.filter((it) => it.tipo === 'specific');

      const specificDates = new Set(
        specificItems
          .map((it) => it.fechaEspecifica)
          .filter((d): d is string => !!d),
      );

      if (!replacesSpecificWeek) {
        await em.query(
          `DELETE FROM disponibilidad_cuenta WHERE cuenta_id = $1 AND tipo = 'weekly'`,
          [cuentaId],
        );
      }

      if (weekRange) {
        await em.query(
          `DELETE FROM disponibilidad_cuenta
            WHERE cuenta_id = $1
              AND tipo = 'specific'
              AND fecha_especifica >= $2::date
              AND fecha_especifica <= $3::date`,
          [cuentaId, weekRange.start, weekRange.end],
        );
      } else {
        for (const fecha of specificDates) {
          await em.query(
            `DELETE FROM disponibilidad_cuenta WHERE cuenta_id = $1 AND tipo = 'specific' AND fecha_especifica = $2::date`,
            [cuentaId, fecha],
          );
        }
      }

      let saved: AccountAvailability[] = [];
      const itemsToSave = replacesSpecificWeek ? specificItems : weeklyItems;
      if (itemsToSave.length > 0) {
        saved = await em.save(
          itemsToSave.map((it) =>
            em.create(AccountAvailability, {
              cuentaId,
              diaSemana: it.diaSemana as DiaSemana,
              horaInicio: it.horaInicio,
              horaFin: it.horaFin,
              activo: true,
              tipo: it.tipo,
              fechaEspecifica: it.fechaEspecifica,
            }),
          ),
        );
      }

      const futureAppts = await em
        .getRepository(Appointment)
        .createQueryBuilder('a')
        .where(
          '(a.convocado_a_id = :cuentaId OR a.convocado_por_id = :cuentaId)',
          { cuentaId },
        )
        .andWhere('a.fecha_hora > NOW()')
        .andWhere('a.estado IN (:...states)', {
          states: ['pendiente', 'confirmada'],
        })
        .getMany();

      const cancelled: { appt: Appointment; previous: AppointmentStatus }[] =
        [];
      for (const appt of futureAppts) {
        if (
          this.fitsInAvailability(
            appt,
            saved,
            replacesSpecificWeek ? weekRange : null,
          )
        )
          continue;
        const previous = appt.estado;
        appt.estado = 'cancelada';
        appt.cancelledAt = new Date();
        appt.cancelledById = cuentaId;
        appt.cancelReason =
          'Cancelada automáticamente al actualizar la disponibilidad del profesional';
        cancelled.push({ appt, previous });
      }

      if (cancelled.length) {
        await em.getRepository(Appointment).save(cancelled.map((x) => x.appt));
        for (const { appt, previous } of cancelled) {
          this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CANCELLED, {
            appointmentId: appt.id,
            actorId: cuentaId,
            reason: appt.cancelReason,
            notifyAccountIds: this.recipientsOf(appt),
          } satisfies AppointmentCancelledEvent);
          await this.appendStatusLog(
            appt.id,
            previous,
            'cancelada',
            cuentaId,
            appt.cancelReason,
            em,
          );
        }
      }
      return { saved, cancelledCount: cancelled.length };
    });
  }

  async countFutureAppointments(cuentaId: string): Promise<number> {
    return this.appointmentRepo
      .createQueryBuilder('a')
      .where(
        '(a.convocado_a_id = :cuentaId OR a.convocado_por_id = :cuentaId)',
        { cuentaId },
      )
      .andWhere('a.fecha_hora > NOW()')
      .andWhere('a.estado IN (:...states)', {
        states: ['pendiente', 'confirmada'],
      })
      .getCount();
  }

  async deleteAvailabilitySlot(
    caller: CallerContext,
    slotId: string,
    confirm: boolean,
  ): Promise<{
    deleted: true;
    cancelledCount: number;
    affected?: AffectedAppointmentSummary[];
  }> {
    const slot = await this.availabilityRepo.findOne({ where: { id: slotId } });
    if (!slot)
      throw new NotFoundException('Bloque de disponibilidad no encontrado');
    if (caller.rol !== 'admin' && slot.cuentaId !== caller.id)
      throw new ForbiddenException(
        'No puedes eliminar la disponibilidad de otra persona',
      );

    const affected = await this.appointmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.student', 'student')
      .where('(a.convocado_a_id = :cid OR a.convocado_por_id = :cid)', {
        cid: slot.cuentaId,
      })
      .andWhere('a.estado IN (:...states)', {
        states: ['pendiente', 'confirmada'],
      })
      .andWhere('a.fecha_hora > NOW()')
      .andWhere(
        `EXTRACT(ISODOW FROM a.fecha_hora) = :dow
         AND (a.fecha_hora AT TIME ZONE 'America/Lima')::time >= :hi::time
         AND (a.fecha_hora AT TIME ZONE 'America/Lima')::time < :hf::time`,
        {
          dow: this.diaSemanaToIsoDow(slot.diaSemana),
          hi: slot.horaInicio,
          hf: slot.horaFin,
        },
      )
      .getMany();

    const summaries = affected.map(
      (a): AffectedAppointmentSummary => ({
        id: a.id,
        scheduledAt: a.scheduledAt,
        durationMin: a.durationMin,
        estado: a.estado,
        motivo: a.motivo,
        studentName: a.student
          ? `${a.student.nombre ?? ''} ${a.student.apellido_paterno ?? ''}`.trim()
          : null,
      }),
    );

    if (affected.length > 0 && !confirm) {
      throw new ConflictException({
        message: 'Hay citas activas en este bloque. Confirma para cancelarlas.',
        affectedCount: affected.length,
        affected: summaries,
      });
    }

    return this.dataSource.transaction(async (em) => {
      await em.delete(AccountAvailability, { id: slotId });
      let cancelledCount = 0;
      if (affected.length > 0) {
        const previousByAppt = new Map<string, AppointmentStatus>(
          affected.map((a) => [a.id, a.estado]),
        );
        for (const appt of affected) {
          appt.estado = 'cancelada';
          appt.cancelledAt = new Date();
          appt.cancelledById = caller.id;
          appt.cancelReason =
            'Cancelada por cambio de disponibilidad del profesional';
        }
        await em.getRepository(Appointment).save(affected);
        cancelledCount = affected.length;
        for (const c of affected) {
          this.events.emit(NOTIFICATION_EVENT_NAMES.APPOINTMENT_CANCELLED, {
            appointmentId: c.id,
            actorId: caller.id,
            reason: c.cancelReason,
            notifyAccountIds: this.recipientsOf(c),
          } satisfies AppointmentCancelledEvent);
          await this.appendStatusLog(
            c.id,
            previousByAppt.get(c.id) ?? 'pendiente',
            'cancelada',
            caller.id,
            c.cancelReason,
            em,
          );
        }
      }
      return cancelledCount > 0
        ? { deleted: true as const, cancelledCount, affected: summaries }
        : { deleted: true as const, cancelledCount };
    });
  }

  async getPublicWeeklyAvailability(cuentaId: string, weekStart?: string) {
    const ref = weekStart ? parseLocalDate(weekStart) : new Date();
    if (isNaN(ref.getTime()))
      throw new BadRequestException(
        'weekStart inválido, usa YYYY-MM-DD o DD/MM/YYYY',
      );

    const day = ref.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const account = await this.loadAccountSummary(cuentaId);
    if (!account) throw new NotFoundException('Cuenta no encontrada');

    const pad = (n: number) => String(n).padStart(2, '0');
    const toDateStr = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const days: {
      date: string;
      diaSemana: DiaSemana;
      slots: { start: string; end: string; available: boolean }[];
    }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = toDateStr(d);
      const diaSemana = DIAS_SEMANA_INDEXED[d.getDay()];
      if (!diaSemana) continue;
      const slots = await this.getFreeSlots(cuentaId, dateStr);
      days.push({ date: dateStr, diaSemana, slots });
    }

    return { cuentaId, rol: account.rol, weekStart: toDateStr(monday), days };
  }

  private cutoffToMinutes(cutoff: string | null | undefined): number | null {
    if (!cutoff) return null;
    const [h, m] = cutoff.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  private diaSemanaToIsoDow(d: DiaSemana): number {
    const map: Record<DiaSemana, number> = {
      lunes: 1,
      martes: 2,
      miercoles: 3,
      jueves: 4,
      viernes: 5,
      sabado: 6,
    };
    return map[d];
  }

  private minutesToHHMM(total: number): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  private hhmmToMinutes(value: string): number {
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m))
      throw new BadRequestException('Formato de hora inválido, usa HH:mm');
    return h * 60 + m;
  }

  private normalizeAvailabilityItem(
    item: AvailabilityItemInput,
  ): NormalizedAvailabilityItem {
    const tipo = item.tipo ?? 'weekly';
    if (tipo !== 'weekly' && tipo !== 'specific')
      throw new BadRequestException('Tipo de disponibilidad inválido');
    if (!DIAS_SEMANA_INDEXED.includes(item.diaSemana as DiaSemana))
      throw new BadRequestException('Día de disponibilidad inválido');
    const start = this.hhmmToMinutes(item.horaInicio);
    const end = this.hhmmToMinutes(item.horaFin);
    const fechaEspecifica = item.fechaEspecifica?.trim() || null;
    if (end <= start)
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la hora de inicio',
      );
    if (tipo === 'specific') {
      if (!fechaEspecifica)
        throw new BadRequestException(
          'La disponibilidad por semana requiere fechaEspecifica',
        );
      const normalizedDate = normalizeDateOnlyInput(fechaEspecifica);
      if (!normalizedDate)
        throw new BadRequestException(
          'Formato de fecha inválido para fechaEspecifica, usa YYYY-MM-DD o DD/MM/YYYY',
        );
      return {
        diaSemana: item.diaSemana,
        horaInicio: this.minutesToHHMM(start),
        horaFin: this.minutesToHHMM(end),
        tipo,
        fechaEspecifica: normalizedDate,
      };
    }

    return {
      diaSemana: item.diaSemana,
      horaInicio: this.minutesToHHMM(start),
      horaFin: this.minutesToHHMM(end),
      tipo,
      fechaEspecifica: null,
    };
  }

  private resolveWeekRange(weekStart: string): { start: string; end: string } {
    const monday = parseLocalDate(weekStart);
    if (isNaN(monday.getTime()))
      throw new BadRequestException(
        'Formato de fecha inválido para weekStart, usa YYYY-MM-DD o DD/MM/YYYY',
      );
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: this.toLocalDateStr(monday),
      end: this.toLocalDateStr(sunday),
    };
  }

  private splitRangesAround(
    ranges: Array<{ start: number; end: number }>,
    busyStart: number,
    busyEnd: number,
  ): Array<{ start: number; end: number }> {
    const result: Array<{ start: number; end: number }> = [];
    for (const range of ranges) {
      if (busyEnd <= range.start || busyStart >= range.end) {
        result.push(range);
        continue;
      }
      if (busyStart > range.start)
        result.push({ start: range.start, end: busyStart });
      if (busyEnd < range.end) result.push({ start: busyEnd, end: range.end });
    }
    return result.filter((r) => r.end > r.start);
  }

  private async blockSpecificAvailabilityRange(
    em: EntityManager,
    cuentaId: string,
    scheduledAt: Date,
    durationMin: number,
  ): Promise<void> {
    const dateStr = this.toLocalDateStr(scheduledAt);
    const diaSemana = DIAS_SEMANA_INDEXED[scheduledAt.getDay()];
    if (!diaSemana) return;

    const repo = em.getRepository(AccountAvailability);
    const specific = await repo.find({
      where: { cuentaId, fechaEspecifica: dateStr, activo: true },
      order: { horaInicio: 'ASC' },
    });
    const source =
      specific.length > 0
        ? specific
        : await repo.find({
            where: { cuentaId, diaSemana, tipo: 'weekly', activo: true },
            order: { horaInicio: 'ASC' },
          });
    if (!source.length) return;

    const busyStart = scheduledAt.getHours() * 60 + scheduledAt.getMinutes();
    const busyEnd = busyStart + durationMin;
    const remaining = this.splitRangesAround(
      source.map((b) => ({
        start: this.hhmmToMinutes(b.horaInicio),
        end: this.hhmmToMinutes(b.horaFin),
      })),
      busyStart,
      busyEnd,
    );

    await em.query(
      `DELETE FROM disponibilidad_cuenta
        WHERE cuenta_id = $1 AND tipo = 'specific' AND fecha_especifica = $2::date`,
      [cuentaId, dateStr],
    );

    if (remaining.length > 0) {
      await repo.save(
        remaining.map((range) =>
          repo.create({
            cuentaId,
            diaSemana,
            horaInicio: this.minutesToHHMM(range.start),
            horaFin: this.minutesToHHMM(range.end),
            activo: true,
            tipo: 'specific',
            fechaEspecifica: dateStr,
          }),
        ),
      );
    }
  }

  async getRulesForTarget(targetId?: string) {
    if (!targetId) return null;
    const acc = await this.loadAccountSummary(targetId);
    if (!acc || acc.rol === 'alumno' || acc.rol === 'padre') return null;
    const role = this.toAppointmentRole(acc);
    const rule = getAppointmentRule(role);
    const availabilityBlockMin =
      role === 'docente' ? 45 : (rule.slotMinutes ?? 15);

    return {
      role,
      fixedDurationMin: rule.fixedDurationMin,
      maxDurationMin: rule.maxDurationMin,
      slotMinutes: rule.slotMinutes,
      availabilityBlockMin,
      maxConsecutiveSlots: rule.maxConsecutiveSlots,
      allowedDays: [...rule.allowedDays],
      defaultHours: { ...rule.defaultHours },
      attentionEnd: rule.attentionEnd ?? null,
      directBooking: rule.directBooking,
      label: rule.label,
    };
  }

  async listBookableTeachers(caller: CallerContext): Promise<
    Array<{
      id: string;
      nombre: string;
      apellido_paterno: string;
      apellido_materno: string | null;
      especialidad: string | null;
      tutoria_actual: { seccion_id: string; seccion_label: string } | null;
    }>
  > {
    type Row = {
      id: string;
      nombre: string;
      apellido_paterno: string;
      apellido_materno: string | null;
      especialidad: string | null;
      tutoria_seccion_id: string | null;
      tutoria_seccion_label: string | null;
    };

    const baseSelect = `
      SELECT
        d.id,
        d.nombre,
        d.apellido_paterno,
        d.apellido_materno,
        d.especialidad,
        st.seccion_id AS tutoria_seccion_id,
        CASE
          WHEN st.seccion_id IS NOT NULL
          THEN CONCAT(g.nombre, ' · ', s.nombre)
          ELSE NULL
        END           AS tutoria_seccion_label
      FROM docentes d
      JOIN cuentas c ON c.id = d.id AND c.activo = TRUE
      LEFT JOIN LATERAL (
        SELECT stt.seccion_id
        FROM secciones_tutores stt
        WHERE stt.docente_id = d.id
          AND stt.activo = TRUE
          AND stt.anio = EXTRACT(YEAR FROM NOW())::smallint
        LIMIT 1
      ) st ON TRUE
      LEFT JOIN secciones s ON s.id = st.seccion_id
      LEFT JOIN grados    g ON g.id = s.grado_id
    `;

    if (
      caller.rol === 'admin' ||
      caller.rol === 'psicologa' ||
      caller.rol === 'padre'
    ) {
      const rows = await this.dataSource.query<Row[]>(
        `${baseSelect}
         WHERE d.estado_contrato = 'activo'
         ORDER BY d.apellido_paterno, d.apellido_materno, d.nombre`,
      );
      return rows.map((r) => this.mapTeacherRow(r));
    }

    return [];
  }

  async listBookableAdmins(caller: CallerContext): Promise<
    Array<{
      id: string;
      nombre: string;
      apellido_paterno: string;
      apellido_materno: string | null;
      cargo: string | null;
    }>
  > {
    if (!['admin', 'psicologa', 'padre'].includes(caller.rol)) return [];
    return this.dataSource.query(
      `SELECT a.id, a.nombre, a.apellido_paterno, a.apellido_materno, a.cargo
         FROM admins a
         JOIN cuentas c ON c.id = a.id AND c.activo = TRUE
        ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre`,
    );
  }

  private mapTeacherRow(r: {
    id: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    especialidad: string | null;
    tutoria_seccion_id: string | null;
    tutoria_seccion_label: string | null;
  }) {
    return {
      id: r.id,
      nombre: r.nombre,
      apellido_paterno: r.apellido_paterno,
      apellido_materno: r.apellido_materno,
      especialidad: r.especialidad,
      tutoria_actual: r.tutoria_seccion_id
        ? {
            seccion_id: r.tutoria_seccion_id,
            seccion_label: r.tutoria_seccion_label ?? '',
          }
        : null,
    };
  }

  private async loadAccountSummary(id: string): Promise<AccountSummary | null> {
    const row = await this.dataSource.query<
      { id: string; rol: string; cargo: string | null }[]
    >(
      `SELECT c.id, c.rol::text AS rol, a.cargo
         FROM cuentas c LEFT JOIN admins a ON a.id = c.id
        WHERE c.id = $1 AND c.activo = TRUE LIMIT 1`,
      [id],
    );
    return row[0] ?? null;
  }

  private toAppointmentRole(account: AccountSummary): AppointmentRole {
    return resolveAppointmentRole(account.rol as never, account.cargo);
  }

  private resolveDuration(
    rule: ReturnType<typeof getAppointmentRule>,
    requested: number | undefined,
  ): number {
    if (rule.fixedDurationMin !== null) return rule.fixedDurationMin;
    const value = requested ?? rule.slotMinutes;
    if (value < rule.slotMinutes)
      throw new BadRequestException(
        `La duración mínima para ${rule.label} es ${rule.slotMinutes} min`,
      );
    if (value % rule.slotMinutes !== 0)
      throw new BadRequestException(
        `La duración debe ser múltiplo de ${rule.slotMinutes} min para ${rule.label}`,
      );
    const maxBySlots = rule.maxConsecutiveSlots * rule.slotMinutes;
    const effectiveMax = Math.min(rule.maxDurationMin, maxBySlots);
    if (value > effectiveMax)
      throw new BadRequestException(
        `Una cita con ${rule.label} puede ocupar a lo sumo ${rule.maxConsecutiveSlots} slot${
          rule.maxConsecutiveSlots === 1 ? '' : 's'
        } consecutivo${rule.maxConsecutiveSlots === 1 ? '' : 's'} (${effectiveMax} min)`,
      );
    return value;
  }

  private recipientsOf(appt: Appointment): string[] {
    const ids = new Set<string>([appt.createdById, appt.convocadoAId]);
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
    if (d.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000)
      throw new BadRequestException(
        `La cita debe agendarse con al menos ${MIN_LEAD_MINUTES} minutos de anticipación`,
      );
    const max = new Date();
    max.setMonth(max.getMonth() + MAX_FUTURE_MONTHS);
    if (d > max)
      throw new BadRequestException(
        `No se puede agendar a más de ${MAX_FUTURE_MONTHS} meses`,
      );
  }

  private assertCanRead(caller: CallerContext, appt: Appointment): void {
    if (caller.rol === 'admin') return;
    if (appt.createdById === caller.id) return;
    if (appt.convocadoAId === caller.id) return;
    if (caller.rol === 'alumno' && appt.studentId === caller.id) return;
    if (caller.rol === 'padre' && appt.parentId === caller.id) return;
    throw new ForbiddenException('No tienes acceso a esta cita');
  }

  private assertStateTransition(
    caller: CallerContext,
    appt: Appointment,
    next: Appointment['estado'],
  ): void {
    if (appt.estado === 'cancelada')
      throw new BadRequestException(
        'Una cita cancelada no puede cambiar de estado',
      );
    if (next === 'realizada' || next === 'no_asistio') {
      if (
        caller.rol !== 'admin' &&
        appt.createdById !== caller.id &&
        appt.convocadoAId !== caller.id
      )
        throw new ForbiddenException(
          'Solo el organizador o el convocado puede registrar la asistencia',
        );
    }
  }

  private async assertCanInvolveStudent(
    caller: CallerContext,
    studentId: string,
  ): Promise<void> {
    switch (caller.rol) {
      case 'admin':
      case 'psicologa':
      case 'docente':
      case 'staff':
        return;
      case 'padre': {
        const linked = await this.dataSource.query<unknown[]>(
          `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2 LIMIT 1`,
          [caller.id, studentId],
        );
        if (!linked.length)
          throw new ForbiddenException(
            'Ese alumno no está vinculado a tu cuenta',
          );
        return;
      }
      case 'alumno':
        if (caller.id !== studentId)
          throw new ForbiddenException(
            'Un alumno solo puede agendar citas sobre sí mismo',
          );
        return;
      default:
        throw new ForbiddenException(
          `Tu rol (${caller.rol}) no puede crear citas`,
        );
    }
  }

  private async assertParentBelongsToStudent(
    parentId: string,
    studentId: string,
  ): Promise<void> {
    const linked = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2 LIMIT 1`,
      [parentId, studentId],
    );
    if (!linked.length)
      throw new BadRequestException(
        'Ese padre no corresponde al alumno indicado',
      );
  }

  private async findParentsOfStudent(studentId: string): Promise<ProfileRow[]> {
    return this.dataSource.query<ProfileRow[]>(
      `SELECT p.id, p.nombre, p.apellido_paterno, p.apellido_materno
         FROM padres p
         JOIN padre_alumno pa ON pa.padre_id = p.id
         JOIN cuentas c       ON c.id = p.id
        WHERE pa.alumno_id = $1 AND c.activo = TRUE`,
      [studentId],
    );
  }

  private async warnIfPsicologaNotLinked(
    psicologaId: string,
    studentId: string,
  ): Promise<void> {
    const linked = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM psicologa_alumno
        WHERE psicologa_id = $1 AND alumno_id = $2 AND activo = TRUE LIMIT 1`,
      [psicologaId, studentId],
    );
    if (!linked.length) {
      Logger.warn(
        `Psicóloga ${psicologaId} sin vínculo activo con alumno ${studentId} al agendar`,
        AppointmentsService.name,
      );
    }
  }

  private async assertSlotFitsAvailability(
    cuentaId: string,
    start: Date,
    durationMin: number,
    ignoreAppointmentId?: string,
    fallback?: { start: string; end: string },
    cutoff?: string | null,
  ): Promise<void> {
    const end = new Date(start.getTime() + durationMin * 60_000);
    const dayName = WEEK_DAYS[start.getDay()];
    if (dayName === 'domingo')
      throw new BadRequestException('No se atiende los domingos');

    const dateStr = this.toLocalDateStr(start);
    const specificForDate = await this.availabilityRepo.find({
      where: { cuentaId, fechaEspecifica: dateStr, activo: true },
      order: { horaInicio: 'ASC' },
    });

    let bloques: AccountAvailability[];
    if (specificForDate.length > 0) {
      bloques = specificForDate;
    } else {
      bloques = await this.availabilityRepo.find({
        where: {
          cuentaId,
          diaSemana: dayName,
          activo: true,
          tipo: 'weekly' as AvailabilityTipo,
        },
        order: { horaInicio: 'ASC' },
      });
    }

    const virtualBlocks =
      bloques.length > 0
        ? bloques.map((d) => ({ horaInicio: d.horaInicio, horaFin: d.horaFin }))
        : fallback
          ? [{ horaInicio: fallback.start, horaFin: fallback.end }]
          : [];

    if (!virtualBlocks.length)
      throw new BadRequestException(
        'El profesional no tiene disponibilidad ese día',
      );

    const cutoffMin = this.cutoffToMinutes(cutoff);

    const fits = virtualBlocks.some((d) => {
      const [hS, mS] = d.horaInicio.split(':').map(Number);
      const [hE, mE] = d.horaFin.split(':').map(Number);
      const blockEndMin =
        cutoffMin !== null ? Math.min(hE * 60 + mE, cutoffMin) : hE * 60 + mE;
      const ds = new Date(start);
      ds.setHours(hS, mS, 0, 0);
      const de = new Date(start);
      de.setHours(Math.floor(blockEndMin / 60), blockEndMin % 60, 0, 0);
      return start >= ds && end <= de;
    });

    if (!fits) {
      const ranges = virtualBlocks
        .map((d) => `${d.horaInicio} - ${d.horaFin}`)
        .join(', ');
      const cutoffNote =
        cutoffMin !== null ? ` (atención hasta las ${cutoff})` : '';
      throw new BadRequestException(
        `Horario fuera de la disponibilidad (${ranges})${cutoffNote}`,
      );
    }

    const overlapQB = this.appointmentRepo
      .createQueryBuilder('a')
      .where(
        '(a.convocado_a_id = :cuentaId OR a.convocado_por_id = :cuentaId)',
        { cuentaId },
      )
      .andWhere('a.estado IN (:...states)', {
        states: ['pendiente', 'confirmada'],
      })
      .andWhere(
        `tstzrange(a.fecha_hora, a.fecha_hora + (a.duracion_min || ' minutes')::interval, '[)')
         && tstzrange(:start, :end, '[)')`,
        { start, end },
      );
    if (ignoreAppointmentId)
      overlapQB.andWhere('a.id <> :ignoreId', {
        ignoreId: ignoreAppointmentId,
      });
    if ((await overlapQB.getCount()) > 0)
      throw new ConflictException('Ese horario ya está ocupado');
  }

  private async upsertPsychologistAssignment(
    em: EntityManager,
    psychologistId: string,
    studentId: string,
  ): Promise<void> {
    await em.query(
      `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde) VALUES ($1, $2, TRUE, CURRENT_DATE)
       ON CONFLICT (psicologa_id, alumno_id) DO UPDATE SET activo = TRUE, hasta = NULL`,
      [psychologistId, studentId],
    );
  }

  private fitsInAvailability(
    appt: Appointment,
    availability: AccountAvailability[],
    scopedWeek: { start: string; end: string } | null = null,
  ): boolean {
    const dt = new Date(appt.scheduledAt);
    const apptDateStr = this.toLocalDateStr(dt);
    if (
      scopedWeek &&
      (apptDateStr < scopedWeek.start || apptDateStr > scopedWeek.end)
    ) {
      return true;
    }
    if (!availability.length) return false;
    const dia = DIAS_SEMANA_INDEXED[dt.getDay()];
    if (!dia) return false;
    const startMin = dt.getHours() * 60 + dt.getMinutes();
    const endMin = startMin + (appt.durationMin ?? 30);
    return availability.some((a) => {
      if (a.diaSemana !== dia) return false;
      if (a.tipo === 'specific' && a.fechaEspecifica !== apptDateStr) {
        return false;
      }
      const [hI, mI] = a.horaInicio.split(':').map(Number);
      const [hF, mF] = a.horaFin.split(':').map(Number);
      return startMin >= hI * 60 + mI && endMin <= hF * 60 + mF;
    });
  }

  private async enrichWithProfileNames(
    items: Appointment[],
  ): Promise<Appointment[]> {
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
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM staff      WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM admins     WHERE id = ANY($1::uuid[])`,
      [Array.from(ids)],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const a of items) {
      const target = a as unknown as Record<
        string,
        AppointmentPersonView | null
      >;
      if (a.convocadoAId && a.convocadoA) {
        const p = byId.get(a.convocadoAId);
        if (p)
          Object.assign(a.convocadoA as unknown as Record<string, unknown>, {
            nombre: p.nombre,
            apellido_paterno: p.apellido_paterno,
            apellido_materno: p.apellido_materno,
          });
      }
      if (a.createdById && a.createdBy) {
        const p = byId.get(a.createdById);
        target['convocadoPor'] = {
          id: a.createdBy.id,
          rol: a.createdBy.rol,
          nombre: p?.nombre ?? '',
          apellido_paterno: p?.apellido_paterno ?? '',
          apellido_materno: p?.apellido_materno ?? null,
        };
      } else {
        target['convocadoPor'] = null;
      }
    }
    return items;
  }
}
