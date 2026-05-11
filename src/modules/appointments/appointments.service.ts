import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Brackets, EntityManager } from 'typeorm';
import { Appointment } from './entities/appointment.entity.js';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import {
  AccountAvailability,
  DiaSemana,
} from './entities/account-availability.entity.js';
import { PsychologistStudent } from '../psychology/entities/psychologist-student.entity.js';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  ListAppointmentsQueryDto,
} from './dto/appointments.dto.js';
import {
  AppointmentRecipientRole,
  APPOINTMENT_RECIPIENT_ROLES,
  ROLES_WITH_AVAILABILITY,
  RoleWithAvailability,
} from './appointments.types.js';

const WEEK_DAYS = [
  'domingo',
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

const MAX_FUTURE_MONTHS = 6;
const MIN_LEAD_MINUTES = 15;

interface CallerContext {
  id: string;
  rol: string;
}

interface ProfileRow {
  id: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string | null;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Cuenta)
    private readonly cuentaRepo: Repository<Cuenta>,
    @InjectRepository(AccountAvailability)
    private readonly availabilityRepo: Repository<AccountAvailability>,
    @InjectRepository(PsychologistStudent)
    private readonly assignmentRepo: Repository<PsychologistStudent>,
    private readonly dataSource: DataSource,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // CREATE
  // ════════════════════════════════════════════════════════════════

  async createAppointment(
    caller: CallerContext,
    dto: CreateAppointmentDto,
  ): Promise<Appointment> {
    const scheduledAt = new Date(dto.scheduledAt);
    this.assertScheduledAtIsValid(scheduledAt);

    if (!dto.studentId && !dto.parentId) {
      throw new BadRequestException(
        'Debe indicar al menos un alumno o un padre/tutor',
      );
    }

    if (caller.id === dto.convocadoAId) {
      throw new BadRequestException('No puedes convocarte a ti mismo');
    }

    const convocadoA = await this.cuentaRepo.findOne({
      where: { id: dto.convocadoAId, activo: true },
      select: ['id', 'rol'],
    });
    if (!convocadoA) {
      throw new NotFoundException(
        'La cuenta convocada no existe o está inactiva',
      );
    }

    if (
      !APPOINTMENT_RECIPIENT_ROLES.includes(
        convocadoA.rol as AppointmentRecipientRole,
      )
    ) {
      throw new BadRequestException(
        `No se puede convocar a un usuario con rol ${convocadoA.rol}`,
      );
    }

    if (dto.studentId) {
      await this.assertCanInvolveStudent(caller, dto.studentId);
    }
    if (dto.parentId && dto.studentId) {
      await this.assertParentBelongsToStudent(dto.parentId, dto.studentId);
    }

    const durationMin = dto.durationMin ?? 30;

    // 1) El slot debe caer dentro de la disponibilidad del CONVOCADO
    //    (psicóloga / docente / admin / auxiliar).
    if (hasAvailability(convocadoA.rol)) {
      await this.assertSlotFitsAvailability(
        convocadoA.id,
        scheduledAt,
        durationMin,
      );
    }

    // 2) También debe caer dentro de la disponibilidad del CONVOCANTE
    //    cuando este tiene calendario propio (cierra el agujero por el que
    //    un docente podía citar a un padre fuera de su propio horario).
    if (hasAvailability(caller.rol) && caller.id !== convocadoA.id) {
      await this.assertSlotFitsAvailability(
        caller.id,
        scheduledAt,
        durationMin,
      );
    }

    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      // Conflicto: el slot solapa una cita activa donde el convocado O el
      // convocante ya tienen algo agendado en cualquiera de las dos puntas.
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
          `tstzrange(a.fecha_hora,
                               a.fecha_hora + (a.duracion_min || ' minutes')::interval,
                               '[)')
                     && tstzrange(:start, :end, '[)')`,
          {
            start: scheduledAt,
            end: new Date(scheduledAt.getTime() + durationMin * 60_000),
          },
        )
        .getOne();

      if (conflict) {
        throw new ConflictException('Ese horario ya está ocupado');
      }

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
        estado: 'pendiente',
        priorNotes: dto.priorNotes ?? null,
      });
      const saved = await em.save(appointment);

      if (dto.studentId) {
        if (convocadoA.rol === 'psicologa') {
          await this.upsertPsychologistAssignment(
            em,
            convocadoA.id,
            dto.studentId,
          );
        }
        if (caller.rol === 'psicologa') {
          await this.upsertPsychologistAssignment(em, caller.id, dto.studentId);
        }
      }

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

    if (caller.rol === 'alumno') {
      qb.orWhere('a.alumno_id = :id', { id: caller.id });
    }

    if (q.estado) qb.andWhere('a.estado = :estado', { estado: q.estado });
    if (q.studentId)
      qb.andWhere('a.alumno_id = :student', { student: q.studentId });
    if (q.from)
      qb.andWhere('a.fecha_hora >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.fecha_hora <= :to', { to: new Date(q.to) });

    const [items, total] = await qb
      .orderBy('a.scheduledAt', order)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

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
    if (!['admin', 'psicologa', 'docente', 'auxiliar'].includes(caller.rol)) {
      throw new ForbiddenException('Tu rol no puede ver citas por alumno');
    }

    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const order = q.order ?? 'DESC';

    const qb = this.baseAppointmentQuery().where('a.alumno_id = :studentId', {
      studentId,
    });
    if (q.estado) qb.andWhere('a.estado = :estado', { estado: q.estado });
    if (q.from)
      qb.andWhere('a.fecha_hora >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.fecha_hora <= :to', { to: new Date(q.to) });

    const [items, total] = await qb
      .orderBy('a.fecha_hora', order)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

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
    ) {
      throw new ForbiddenException('No participas en esta cita');
    }

    if (dto.scheduledAt) {
      const newDate = new Date(dto.scheduledAt);
      this.assertScheduledAtIsValid(newDate);

      const newDuration = dto.durationMin ?? appt.durationMin;
      const recipient = await this.cuentaRepo.findOne({
        where: { id: appt.convocadoAId },
        select: ['id', 'rol'],
      });

      if (recipient && hasAvailability(recipient.rol)) {
        await this.assertSlotFitsAvailability(
          recipient.id,
          newDate,
          newDuration,
          appt.id,
        );
      }
      if (hasAvailability(caller.rol) && caller.id !== appt.convocadoAId) {
        await this.assertSlotFitsAvailability(
          caller.id,
          newDate,
          newDuration,
          appt.id,
        );
      }
      appt.scheduledAt = newDate;
    }

    if (dto.durationMin !== undefined) appt.durationMin = dto.durationMin;
    if (dto.followUpNotes !== undefined) appt.followUpNotes = dto.followUpNotes;
    if (dto.rescheduledFromId !== undefined) {
      if (dto.rescheduledFromId === appt.id) {
        throw new BadRequestException(
          'Una cita no puede ser reagendamiento de sí misma',
        );
      }
      appt.rescheduledFromId = dto.rescheduledFromId;
    }

    if (dto.estado && dto.estado !== appt.estado) {
      this.assertStateTransition(caller, appt, dto.estado);
      appt.estado = dto.estado;
      if (dto.estado === 'cancelada') {
        appt.cancelledAt = new Date();
        appt.cancelledById = caller.id;
      }
    }

    return this.appointmentRepo.save(appt);
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
    ) {
      throw new ForbiddenException('No participas en esta cita');
    }
    if (
      appt.estado === 'cancelada' ||
      appt.estado === 'rechazada' ||
      appt.estado === 'realizada'
    ) {
      throw new BadRequestException(
        `No se puede cancelar una cita ${appt.estado}`,
      );
    }

    appt.estado = 'cancelada';
    appt.cancelledAt = new Date();
    appt.cancelledById = caller.id;
    appt.cancelReason = dto.motivo ?? null;
    return this.appointmentRepo.save(appt);
  }

  // ════════════════════════════════════════════════════════════════
  // RESPUESTA DEL CONVOCADO  (padre / alumno aceptan o rechazan)
  // ════════════════════════════════════════════════════════════════

  async acceptAppointment(
    caller: CallerContext,
    id: string,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id) {
      throw new ForbiddenException('Solo el convocado puede aceptar la cita');
    }
    if (appt.estado !== 'pendiente') {
      throw new BadRequestException(
        `Solo se pueden aceptar citas pendientes (estado actual: ${appt.estado})`,
      );
    }

    appt.estado = 'confirmada';
    return this.appointmentRepo.save(appt);
  }

  async rejectAppointment(
    caller: CallerContext,
    id: string,
    motivo: string,
  ): Promise<Appointment> {
    const appt = await this.appointmentRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id) {
      throw new ForbiddenException('Solo el convocado puede rechazar la cita');
    }
    if (appt.estado !== 'pendiente') {
      throw new BadRequestException(
        `Solo se pueden rechazar citas pendientes (estado actual: ${appt.estado})`,
      );
    }
    if (!motivo || motivo.trim().length < 3) {
      throw new BadRequestException(
        'Debe indicar un motivo para rechazar la cita',
      );
    }

    appt.estado = 'rechazada';
    appt.cancelledAt = new Date();
    appt.cancelledById = caller.id;
    appt.cancelReason = motivo.trim();
    return this.appointmentRepo.save(appt);
  }

  // ════════════════════════════════════════════════════════════════
  // DISPONIBILIDAD
  // ════════════════════════════════════════════════════════════════

  /** Disponibilidad declarada por el profesional. */
  async getAvailability(cuentaId: string): Promise<AccountAvailability[]> {
    return this.availabilityRepo.find({
      where: { cuentaId, activo: true },
      order: { diaSemana: 'ASC', horaInicio: 'ASC' },
    });
  }

  /** Citas ya agendadas en la semana de la fecha recibida. */
  async getSlotsTaken(cuentaId: string, date: string) {
    if (!date) {
      throw new BadRequestException(
        'El parámetro date es requerido (YYYY-MM-DD)',
      );
    }

    const ref = new Date(date);
    if (isNaN(ref.getTime())) {
      throw new BadRequestException(
        'Formato de fecha inválido, usa YYYY-MM-DD',
      );
    }

    const day = ref.getDay(); // 0=dom ... 6=sab
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Bloquean el calendario tanto las citas en las que la cuenta es la
    // convocada como aquellas que la misma cuenta convoca a otros.
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

  /** Reemplaza atómicamente toda la disponibilidad del usuario. */
  async replaceAvailability(
    cuentaId: string,
    items: { diaSemana: string; horaInicio: string; horaFin: string }[],
  ): Promise<AccountAvailability[]> {
    return this.dataSource.transaction(async (em) => {
      await em.delete(AccountAvailability, { cuentaId });

      if (items.length === 0) return [];

      const rows = items.map((it) =>
        em.create(AccountAvailability, {
          cuentaId,
          diaSemana: it.diaSemana as DiaSemana,
          horaInicio: it.horaInicio,
          horaFin: it.horaFin,
          activo: true,
        }),
      );

      return em.save(rows);
    });
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════

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
      throw new BadRequestException(
        `La cita debe agendarse con al menos ${MIN_LEAD_MINUTES} minutos de anticipación`,
      );
    }
    const max = new Date();
    max.setMonth(max.getMonth() + MAX_FUTURE_MONTHS);
    if (d > max) {
      throw new BadRequestException(
        `No se puede agendar a más de ${MAX_FUTURE_MONTHS} meses`,
      );
    }
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
    if (appt.estado === 'cancelada') {
      throw new BadRequestException(
        'Una cita cancelada no puede cambiar de estado',
      );
    }
    if (next === 'realizada' || next === 'no_asistio') {
      if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id) {
        throw new ForbiddenException(
          'Solo el convocado puede marcar la cita como realizada o no asistió',
        );
      }
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
        if (linked.length === 0) {
          throw new ForbiddenException(
            'Ese alumno no está vinculado a tu cuenta',
          );
        }
        return;
      }

      case 'alumno':
        if (caller.id !== studentId) {
          throw new ForbiddenException(
            'Un alumno solo puede agendar citas sobre sí mismo',
          );
        }
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
    if (linked.length === 0) {
      throw new BadRequestException(
        'Ese padre no corresponde al alumno indicado',
      );
    }
  }

  private async assertSlotFitsAvailability(
    cuentaId: string,
    start: Date,
    durationMin: number,
    ignoreAppointmentId?: string,
  ): Promise<void> {
    const end = new Date(start.getTime() + durationMin * 60_000);
    const dayName = WEEK_DAYS[start.getDay()];

    if (dayName === 'domingo') {
      throw new BadRequestException('No se atiende los domingos');
    }

    // Soporta múltiples bloques en un mismo día (ej. 08-12 y 14-18).
    const bloques = await this.availabilityRepo.find({
      where: { cuentaId, diaSemana: dayName as DiaSemana, activo: true },
      order: { horaInicio: 'ASC' },
    });

    if (bloques.length === 0) {
      throw new BadRequestException(
        'El profesional no tiene disponibilidad ese día',
      );
    }

    const fits = bloques.some((d) => {
      const [hS, mS] = d.horaInicio.split(':').map(Number);
      const [hE, mE] = d.horaFin.split(':').map(Number);

      const dayStart = new Date(start);
      dayStart.setHours(hS, mS, 0, 0);
      const dayEnd = new Date(start);
      dayEnd.setHours(hE, mE, 0, 0);

      return start >= dayStart && end <= dayEnd;
    });

    if (!fits) {
      const ranges = bloques
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
        `tstzrange(a.fecha_hora,
                           a.fecha_hora + (a.duracion_min || ' minutes')::interval,
                           '[)')
                 && tstzrange(:start, :end, '[)')`,
        { start, end },
      );

    if (ignoreAppointmentId) {
      overlapQB.andWhere('a.id <> :ignoreId', {
        ignoreId: ignoreAppointmentId,
      });
    }

    const overlap = await overlapQB.getCount();
    if (overlap > 0) throw new ConflictException('Ese horario ya está ocupado');
  }

  private async upsertPsychologistAssignment(
    em: EntityManager,
    psychologistId: string,
    studentId: string,
  ): Promise<void> {
    await em.query(
      `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde)
             VALUES ($1, $2, TRUE, CURRENT_DATE)
             ON CONFLICT (psicologa_id, alumno_id)
             DO UPDATE SET activo = TRUE, hasta = NULL`,
      [psychologistId, studentId],
    );
  }

  private async enrichWithProfileNames(
    items: Appointment[],
  ): Promise<Appointment[]> {
    if (items.length === 0) return items;

    const ids = Array.from(
      new Set(items.map((a) => a.convocadoAId).filter(Boolean)),
    );
    if (ids.length === 0) return items;

    const rows = await this.dataSource.query<ProfileRow[]>(
      `SELECT id, nombre, apellido_paterno, apellido_materno FROM psicologas  WHERE id = ANY($1::uuid[])
             UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM alumnos     WHERE id = ANY($1::uuid[])
             UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM padres      WHERE id = ANY($1::uuid[])
             UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM docentes    WHERE id = ANY($1::uuid[])
             UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM auxiliares  WHERE id = ANY($1::uuid[])
             UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM admins      WHERE id = ANY($1::uuid[])`,
      [ids],
    );

    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const a of items) {
      const profile = byId.get(a.convocadoAId);
      if (profile && a.convocadoA) {
        Object.assign(a.convocadoA as unknown as Record<string, unknown>, {
          nombre: profile.nombre,
          apellido_paterno: profile.apellido_paterno,
          apellido_materno: profile.apellido_materno,
        });
      }
    }
    return items;
  }
}
