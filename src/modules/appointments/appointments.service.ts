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
  DiaSemana,
} from './entities/account-availability.entity.js';
import { PsychologistStudent } from '../psychology/entities/psychologist-student.entity.js';
import type { AppointmentStatus } from './appointments.types.js';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  ListAppointmentsQueryDto,
  PostponeAppointmentDto,
  DeriveAppointmentDto,
  CompleteAppointmentDto,
} from './dto/appointments.dto.js';
import {
  ROLES_WITH_AVAILABILITY,
  RoleWithAvailability,
  ProfileRow,
} from './appointments.types.js';
import {
  AppointmentRole,
  getAppointmentRule,
  isDayAllowed,
  formatAllowedDays,
  resolveAppointmentRole,
  canInvite,
  callerRequiresStudent,
  callerOwnsSchedule,
  allowedRecipientsFor,
  resolveInitialStatus,
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

function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
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

interface AppointmentPersonView {
  id: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  rol: string;
}

/**
 * Información que devolvemos al FE cuando un endpoint produce una
 * cascada de cancelaciones (vista bonita en el modal "¿Estás seguro?").
 */
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

  // ════════════════════════════════════════════════════════════════
  // HISTORIAL DE ESTADOS
  // ════════════════════════════════════════════════════════════════

  /**
   * Inserta una entrada en `cita_estado_log`. Se llama desde cada
   * método que cambia el estado de una cita (crear, aceptar, rechazar,
   * cancelar, aplazar, realizar, no_asistio, cancelaciones en cascada).
   *
   * Errores se loguean pero no abortan la transacción principal — el
   * historial es un complemento, no debe tumbar la operación funcional.
   */
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

  /**
   * Devuelve el historial completo de transiciones de estado de una cita.
   * Sólo participantes (caller en createdById/convocadoAId/parentId) o
   * admin pueden consultarlo.
   */
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
            c.nombre              AS changed_by_nombre,
            c.apellido_paterno    AS changed_by_apellido_paterno,
            c.rol::text           AS changed_by_rol,
            l.razon,
            l.changed_at
         FROM cita_estado_log l
         LEFT JOIN cuentas c ON c.id = l.changed_by_id
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

  // ════════════════════════════════════════════════════════════════
  // CREATE
  // ════════════════════════════════════════════════════════════════

  async createAppointment(
    caller: CallerContext,
    dto: CreateAppointmentDto,
  ): Promise<Appointment & { availableParents?: ProfileRow[] }> {
    const scheduledAt = new Date(dto.scheduledAt);
    this.assertScheduledAtIsValid(scheduledAt);

    if (caller.rol === 'alumno')
      dto = { ...dto, studentId: caller.id, parentId: undefined };

    if (caller.id === dto.convocadoAId)
      throw new BadRequestException('No puedes convocarte a ti mismo');

    const convocadoA = await this.loadAccountSummary(dto.convocadoAId);
    if (!convocadoA)
      throw new NotFoundException(
        'La cuenta convocada no existe o está inactiva',
      );

    // ── Regla "una cita activa por padre" ──────────────────────────
    //
    // Spec (Aarón, 2026-05): un padre no puede tener múltiples citas
    // pendientes/confirmadas simultáneas con profesionales distintos.
    // Mientras tenga una cita activa con un usuario, no puede pedir
    // otra con un usuario diferente. Sí puede reprogramar/cancelar la
    // existente — al hacerlo, queda libre para crear una nueva.
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

    // Reglas centralizadas: quién puede citar a quién.
    if (!canInvite(caller.rol as CallerRol, convocadoA.rol as CallerRol)) {
      const permitidos = allowedRecipientsFor(caller.rol as CallerRol);
      const detalle = permitidos.length
        ? `Tu rol (${caller.rol}) solo puede agendar citas con: ${permitidos.join(', ')}.`
        : `Tu rol (${caller.rol}) no puede crear citas.`;
      throw new ForbiddenException(detalle);
    }

    // Caller que SIEMPRE requiere alumno (docente, admin, auxiliar).
    if (callerRequiresStudent(caller.rol as CallerRol) && !dto.studentId)
      throw new BadRequestException(
        'Debes indicar el alumno al que corresponde la cita',
      );

    // Para psicóloga / padre / alumno se mantiene la regla previa: al menos uno.
    if (!dto.studentId && !dto.parentId)
      throw new BadRequestException(
        'Debe indicar al menos un alumno o un padre/tutor',
      );

    // Autocompletar padre cuando psicóloga cita al alumno y no envió parentId.
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
    // Aviso (no bloqueante): la psicóloga no tiene vínculo activo con el alumno.
    if (convocadoA.rol === 'psicologa' && dto.studentId)
      await this.warnIfPsicologaNotLinked(convocadoA.id, dto.studentId);
    if (caller.rol === 'psicologa' && dto.studentId)
      await this.warnIfPsicologaNotLinked(caller.id, dto.studentId);

    // ── Qué regla manda la duración/slot ───────────────────────────
    //
    // Si el CONVOCADOR tiene su propia disponibilidad (psicóloga, docente,
    // admin/director), su regla gana: la cita se acopla a su calendario y
    // a su `slotMinutes`. El padre/alumno son convocados pasivos y no
    // imponen duración.
    //
    // Si el CONVOCADOR no tiene disponibilidad (padre, alumno), la cita
    // se acopla al calendario del CONVOCADO (psicóloga o docente).
    //
    // Caso especial preexistente: psicóloga citando a un alumno usa su
    // propia regla (el alumno no tiene calendario).
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
      );

    if (hasAvailability(caller.rol) && caller.id !== convocadoA.id)
      await this.assertSlotFitsAvailability(
        caller.id,
        scheduledAt,
        durationMin,
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

      // Matriz de estado inicial (spec Aarón 2026-05):
      //   padre → psi          confirmada
      //   alumno → psi         confirmada
      //   psi → alumno         confirmada (sin padre vinculado)
      //   psi → alumno + padre pendiente
      //   psi → padre          pendiente
      //   docente → padre      pendiente
      //   admin → padre        pendiente
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

      // Primera entrada del historial: anterior=null → nuevo=estado inicial.
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

      // Adjuntamos availableParents si la psicóloga generó la cita sin parentId
      // y el alumno tiene más de un padre vinculado, para que el FE pueda
      // ofrecer la opción al usuario.
      if (availableParents) {
        (
          saved as Appointment & { availableParents?: ProfileRow[] }
        ).availableParents = availableParents;
      }
      return saved;
    });
  }

  // ════════════════════════════════════════════════════════════════
  // READ
  // ════════════════════════════════════════════════════════════════

  /**
   * Auto-cierre de citas vencidas. Para cualquier cita cuyo
   * `scheduledAt + durationMin` haya quedado en el pasado y siga en
   * estado `pendiente` o `confirmada`, el sistema la marca:
   *
   *   - `confirmada` → `realizada` (cita aceptada, se asume cumplida)
   *   - `pendiente`  → `no_asistio` (nadie confirmó a tiempo)
   *
   * Es idempotente: si no hay nada para cerrar, no hace nada. Se llama
   * antes de devolver listados o detalles para que el FE siempre vea
   * estados coherentes con la fecha actual.
   */
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

    // Aplica filtros sobre un QB sin joins (evita bug de TypeORM con
    // skip/take + leftJoinAndSelect + orderBy en createOrderByCombinedWithSelectExpression)
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

    // Paso 1: IDs paginados sin relaciones (sin bug)
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

    // Paso 2: entidades completas con relaciones, sin skip/take (sin bug)
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
    if (!['admin', 'psicologa', 'docente', 'auxiliar'].includes(caller.rol))
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

  // ════════════════════════════════════════════════════════════════
  // UPDATE / CANCEL
  // ════════════════════════════════════════════════════════════════

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

    // Spec (Aarón, 2026-05): el motivo de cancelación es OBLIGATORIO y
    // queda persistido para que ambas partes sepan por qué se canceló.
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

  // ════════════════════════════════════════════════════════════════
  // ACEPTAR / RECHAZAR
  // ════════════════════════════════════════════════════════════════

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

    // Spec (Aarón, 2026-05): cuando una cita queda `pendiente` por un
    // aplazamiento, la parte que NO aplazó debe ser quien confirme. Si
    // la última transición fue `aplazar` por `caller.id`, no puede
    // auto-confirmar su propia propuesta — la confirmación debe venir
    // del otro lado de la cita.
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

    // Quién puede aceptar: el convocado original, o — si el aplazamiento
    // lo hizo el convocado — el convocador. Admin siempre puede.
    const isConvocador = appt.createdById === caller.id;
    const isConvocado = appt.convocadoAId === caller.id;
    const lastPostponeByConvocado =
      lastPostpone &&
      lastPostpone.changedById === appt.convocadoAId &&
      lastPostpone.previousStatus !== null;
    const canAccept =
      caller.rol === 'admin' ||
      isConvocado ||
      (lastPostponeByConvocado && isConvocador);
    if (!canAccept)
      throw new ForbiddenException(
        'Solo la parte que no propuso el aplazamiento puede confirmar la cita',
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
    if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id)
      throw new ForbiddenException('Solo el convocado puede rechazar la cita');
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

  // ════════════════════════════════════════════════════════════════
  // APLAZAR / REALIZAR / INASISTENCIA  (spec sec. 4)
  // ════════════════════════════════════════════════════════════════

  /**
   * Aplaza la cita proponiendo una nueva fecha. Dos caminos según quién llama:
   *
   *  • CONVOCADOR (psicóloga, docente, admin/director): re-propone el horario
   *    dentro de su propia disponibilidad. La cita vuelve a `pendiente` y el
   *    convocado debe re-aceptar.
   *
   *  • CONVOCADO (padre, alumno): contra-propone un horario dentro de la
   *    disponibilidad del CONVOCADOR. También deja la cita en `pendiente`,
   *    pero ahora es el convocador quien debe re-aceptar.
   *
   *  • admin sin ser parte: puede aplazar cualquier cita (uso operativo).
   *
   * El motivo es obligatorio en ambos casos y queda registrado tanto en
   * `prior_notes` como en `cita_estado_log.razon` para auditoría.
   */
  async postponeAppointment(
    caller: CallerContext,
    id: string,
    dto: PostponeAppointmentDto,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    // Spec (Aarón, 2026-05): el alumno NUNCA puede aplazar una cita.
    // Solo puede cancelar (con motivo). El resto de roles puede aplazar.
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

    // ── Validar disponibilidad según quién aplaza ────────────────
    // El nuevo horario SIEMPRE debe caer en el calendario del convocador
    // (es su agenda la que se respeta). Mantenemos también la duración
    // original de la cita.
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

  /** La psicóloga marca la cita como realizada (cierre administrativo). */
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

  /**
   * La psicóloga marca la cita como `no_asistio`. Se notifica al padre vinculado
   * al alumno (si lo hay) con el evento `inasistencia_alumno`.
   */
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

    // Notificación inasistencia_alumno al padre vinculado.
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

  // ════════════════════════════════════════════════════════════════
  // DERIVACIÓN docente → psicóloga
  // ════════════════════════════════════════════════════════════════

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

    // Reutilizamos createAppointment con tipo=psicologico y caller=docente
    // pero como caller=docente no puede convocar a psicologa (matriz)
    // creamos la cita directamente respetando las reglas mínimas.
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

      // Spec (Aarón, 2026-05):
      //   Al derivar el docente al alumno, la cita debe quedar auto-
      //   confirmada ante la psicóloga (informativa para el docente,
      //   accionable para la psicóloga). El alumno la verá como
      //   "confirmada" con subtítulo "Derivado por: <docente>".
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
        priorNotes: `[Derivación] Docente ${caller.id} → Psicóloga ${psicologaSummary.id}`,
      });
      const saved = await em.save(appointment);

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

    const bloques = await this.availabilityRepo.find({
      where: { cuentaId, diaSemana: dayName, activo: true },
      order: { horaInicio: 'ASC' },
    });

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

  async replaceAvailability(
    cuentaId: string,
    items: { diaSemana: string; horaInicio: string; horaFin: string }[],
  ): Promise<{ saved: AccountAvailability[]; cancelledCount: number }> {
    return this.dataSource.transaction(async (em) => {
      await em.delete(AccountAvailability, { cuentaId });

      let saved: AccountAvailability[] = [];
      if (items.length > 0) {
        saved = await em.save(
          items.map((it) =>
            em.create(AccountAvailability, {
              cuentaId,
              diaSemana: it.diaSemana as DiaSemana,
              horaInicio: it.horaInicio,
              horaFin: it.horaFin,
              activo: true,
            }),
          ),
        );
      }

      const futureAppts = await em
        .getRepository(Appointment)
        .createQueryBuilder('a')
        .where('a.convocado_a_id = :cuentaId', { cuentaId })
        .andWhere('a.fecha_hora > NOW()')
        .andWhere('a.estado IN (:...states)', {
          states: ['pendiente', 'confirmada'],
        })
        .getMany();

      const cancelled: { appt: Appointment; previous: AppointmentStatus }[] =
        [];
      for (const appt of futureAppts) {
        if (this.fitsInAvailability(appt, saved)) continue;
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
      .where('a.convocado_a_id = :cuentaId', { cuentaId })
      .andWhere('a.fecha_hora > NOW()')
      .andWhere('a.estado IN (:...states)', {
        states: ['pendiente', 'confirmada'],
      })
      .getCount();
  }

  /**
   * Borra un bloque de disponibilidad respetando las citas activas.
   *
   * - Si NO hay citas en el bloque → borra y listo.
   * - Si HAY citas y `confirm` es falso → 409 con la lista de afectadas.
   * - Si HAY citas y `confirm` es true → borra slot + cancela cada cita
   *   con motivo y emite `cita_cancelada` a todas las partes.
   *
   * Solo el dueño del slot (o admin) puede invocarlo.
   */
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

    // Buscamos citas en pendiente o confirmada cuya fecha_hora caiga en
    // el dia_semana y dentro del rango [hora_inicio, hora_fin) del slot.
    const affected = await this.appointmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.student', 'student')
      .where('a.convocado_a_id = :cid', { cid: slot.cuentaId })
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
        ? {
            deleted: true as const,
            cancelledCount,
            affected: summaries,
          }
        : { deleted: true as const, cancelledCount };
    });
  }

  /**
   * Disponibilidad pública en formato "semana": para cada uno de los 6 días
   * (lun–sáb) a partir de `weekStart`, devuelve los slots con flag libre/ocupado.
   * Usado por el alumno o padre para ver agendas de psicólogas y docentes.
   */
  async getPublicWeeklyAvailability(cuentaId: string, weekStart?: string) {
    const ref = weekStart ? parseLocalDate(weekStart) : new Date();
    if (isNaN(ref.getTime()))
      throw new BadRequestException('weekStart inválido, usa YYYY-MM-DD');

    // Lunes de esa semana.
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

    return {
      cuentaId,
      rol: account.rol,
      weekStart: toDateStr(monday),
      days,
    };
  }

  /** Convierte 'lunes' .. 'sabado' a ISO day-of-week 1..6 (1=Mon, 7=Sun). */
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

  async getRulesForTarget(targetId?: string) {
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
      maxConsecutiveSlots: rule.maxConsecutiveSlots,
      allowedDays: [...rule.allowedDays],
      defaultHours: { ...rule.defaultHours },
      directBooking: rule.directBooking,
      label: rule.label,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // DIRECTORIO DE DOCENTES CONVOCABLES (role-aware)
  // ════════════════════════════════════════════════════════════════

  /**
   * Devuelve los docentes que el caller puede convocar.
   *
   * - `padre`: docentes que dictan curso a alguno de sus hijos o son
   *   tutores de su sección. Solo docentes activos.
   * - `psicologa` / `admin`: todos los docentes activos.
   *
   * El padre llama a esto desde el dialog "Agendar cita con docente". El
   * admin lo usa desde gestión de citas. El docente NO debe convocar a otro
   * docente, así que no le exponemos esta ruta.
   */
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
      SELECT DISTINCT
        d.id,
        d.nombre,
        d.apellido_paterno,
        d.apellido_materno,
        d.especialidad,
        s.id  AS tutoria_seccion_id,
        CASE
          WHEN s.id IS NOT NULL
          THEN CONCAT(g.nombre, ' · ', s.nombre)
          ELSE NULL
        END   AS tutoria_seccion_label
      FROM docentes d
      JOIN cuentas c       ON c.id = d.id AND c.activo = TRUE
      LEFT JOIN secciones s ON s.tutor_id = d.id AND s.activo = TRUE
      LEFT JOIN grados g    ON g.id = s.grado_id
    `;

    if (caller.rol === 'admin' || caller.rol === 'psicologa') {
      const rows = await this.dataSource.query<Row[]>(
        `${baseSelect}
         WHERE d.estado_contrato = 'activo'
         ORDER BY d.apellido_paterno, d.apellido_materno, d.nombre`,
      );
      return rows.map((r) => this.mapTeacherRow(r));
    }

    if (caller.rol === 'padre') {
      // Docentes vinculados a los hijos del padre, vía:
      //   1. curso dictado en sección donde el hijo está matriculado
      //      (matrícula activa en el año en curso)
      //   2. tutor de la sección donde el hijo está matriculado
      const rows = await this.dataSource.query<Row[]>(
        `${baseSelect}
         WHERE d.estado_contrato = 'activo'
           AND d.id IN (
             -- Docentes que dictan cursos a los hijos del padre
             SELECT c2.docente_id
             FROM cursos c2
             JOIN matriculas m ON m.seccion_id = c2.seccion_id AND m.activo = TRUE
             JOIN padre_alumno pa ON pa.alumno_id = m.alumno_id
             WHERE pa.padre_id = $1
               AND c2.docente_id IS NOT NULL
             UNION
             -- Tutores de las secciones donde están los hijos
             SELECT s2.tutor_id
             FROM secciones s2
             JOIN matriculas m ON m.seccion_id = s2.id AND m.activo = TRUE
             JOIN padre_alumno pa ON pa.alumno_id = m.alumno_id
             WHERE pa.padre_id = $1
               AND s2.tutor_id IS NOT NULL
           )
         ORDER BY d.apellido_paterno, d.apellido_materno, d.nombre`,
        [caller.id],
      );
      return rows.map((r) => this.mapTeacherRow(r));
    }

    return [];
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

  // ════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════

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
    // Regla canónica: una cita puede ocupar 1 o N slots consecutivos según
    // el rol. El tope estricto se calcula como maxConsecutiveSlots * slot.
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
      case 'auxiliar':
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

  /** Lista los padres vinculados a un alumno (sirve para autocompletar). */
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

  /**
   * Advertencia (no bloqueante, sólo log) cuando la psicóloga no tiene
   * vínculo activo en `psicologa_alumno` con el alumno de la cita.
   */
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
      // No bloquea: el spec pide advertencia, no error.
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
  ): Promise<void> {
    const end = new Date(start.getTime() + durationMin * 60_000);
    const dayName = WEEK_DAYS[start.getDay()];
    if (dayName === 'domingo')
      throw new BadRequestException('No se atiende los domingos');

    const bloques = await this.availabilityRepo.find({
      where: { cuentaId, diaSemana: dayName, activo: true },
      order: { horaInicio: 'ASC' },
    });

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

    const fits = virtualBlocks.some((d) => {
      const [hS, mS] = d.horaInicio.split(':').map(Number);
      const [hE, mE] = d.horaFin.split(':').map(Number);
      const ds = new Date(start);
      ds.setHours(hS, mS, 0, 0);
      const de = new Date(start);
      de.setHours(hE, mE, 0, 0);
      return start >= ds && end <= de;
    });

    if (!fits) {
      const ranges = virtualBlocks
        .map((d) => `${d.horaInicio} - ${d.horaFin}`)
        .join(', ');
      throw new BadRequestException(
        `Horario fuera de la disponibilidad (${ranges})`,
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
  ): boolean {
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
      `SELECT id, nombre, apellido_paterno, apellido_materno FROM psicologas  WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM alumnos    WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM padres     WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM docentes   WHERE id = ANY($1::uuid[])
       UNION ALL SELECT id, nombre, apellido_paterno, apellido_materno FROM auxiliares WHERE id = ANY($1::uuid[])
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
