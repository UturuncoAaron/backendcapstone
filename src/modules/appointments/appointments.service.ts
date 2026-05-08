import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Brackets } from 'typeorm';
import { Appointment } from './entities/appointment.entity.js';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import { PsychologistAvailability } from '../psychology/entities/psychologist-availability.entity.js';
import { PsychologistBlock } from '../psychology/entities/psychologist-block.entity.js';
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

const MAX_FUTURE_MONTHS = 6; // no se puede agendar a más de 6 meses
const MIN_LEAD_MINUTES = 15; // no agendar con menos de 15 min de anticipación

interface CallerContext {
  id: string;
  rol: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Cuenta) private readonly cuentaRepo: Repository<Cuenta>,
    @InjectRepository(PsychologistAvailability)
    private readonly availabilityRepo: Repository<PsychologistAvailability>,
    @InjectRepository(PsychologistBlock)
    private readonly blockRepo: Repository<PsychologistBlock>,
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

    // ── Cargar y validar la contraparte ──────────────────────────
    const convocadoA = await this.cuentaRepo.findOne({
      where: { id: dto.convocadoAId, activo: true },
      select: ['id', 'rol'],
    });
    if (!convocadoA)
      throw new NotFoundException(
        'La cuenta convocada no existe o está inactiva',
      );

    if (
      !APPOINTMENT_RECIPIENT_ROLES.includes(
        convocadoA.rol as AppointmentRecipientRole,
      )
    ) {
      throw new BadRequestException(
        `No se puede convocar a un usuario con rol ${convocadoA.rol}`,
      );
    }

    // ── Validar rol del convocador puede crear con esa contraparte ──
    if (dto.studentId) {
      await this.assertCanInvolveStudent(caller, dto.studentId);
    }
    if (dto.parentId && dto.studentId) {
      await this.assertParentBelongsToStudent(dto.parentId, dto.studentId);
    }

    // ── Validar slot si la contraparte es psicóloga ──────────────
    const durationMin = dto.durationMin ?? 30;
    if (convocadoA.rol === 'psicologa') {
      await this.assertSlotFitsAvailability(
        convocadoA.id,
        scheduledAt,
        durationMin,
      );
    }

    // ── Persistir con anti-doble-booking (transacción serializable) ─
    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      // Re-chequear conflictos dentro de la TX (defensa en profundidad)
      const conflict = await em
        .createQueryBuilder(Appointment, 'a')
        .where('a.convocado_a_id = :rid', { rid: convocadoA.id })
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
        modalidad: dto.modalidad ?? 'presencial',
        motivo: dto.motivo,
        scheduledAt,
        durationMin,
        estado: 'pendiente',
        priorNotes: dto.priorNotes ?? null,
        meetingLink: dto.meetingLink ?? null,
      });
      const saved = await em.save(appointment);

      if (dto.studentId) {
        if (convocadoA.rol === 'psicologa') {
          await this.upsertAssignment(em, convocadoA.id, dto.studentId);
        }
        if (caller.rol === 'psicologa') {
          await this.upsertAssignment(em, caller.id, dto.studentId);
        }
      }

      return saved;
    });
  }

  // ════════════════════════════════════════════════════════════════
  // READ — listados
  // ════════════════════════════════════════════════════════════════

  /** Citas en las que el caller participa (convocador o convocado). */
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

    // Si es alumno: además ver las que son sobre él
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

  /** Citas relacionadas a un alumno específico (admin/psicóloga/docente/auxiliar). */
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

    // Cualquier parte (convocador o convocado) puede actualizar.
    // Admin también.
    if (
      caller.rol !== 'admin' &&
      appt.createdById !== caller.id &&
      appt.convocadoAId !== caller.id
    ) {
      throw new ForbiddenException('No participas en esta cita');
    }

    // ── Reagendamiento ───────────────────────────────────────────
    if (dto.scheduledAt) {
      const newDate = new Date(dto.scheduledAt);
      this.assertScheduledAtIsValid(newDate);

      const newDuration = dto.durationMin ?? appt.durationMin;
      const recipient = await this.cuentaRepo.findOne({
        where: { id: appt.convocadoAId },
        select: ['id', 'rol'],
      });
      if (recipient?.rol === 'psicologa') {
        await this.assertSlotFitsAvailability(
          recipient.id,
          newDate,
          newDuration,
          appt.id,
        );
      }
      appt.scheduledAt = newDate;
    }

    if (dto.durationMin !== undefined) appt.durationMin = dto.durationMin;
    if (dto.modalidad !== undefined) appt.modalidad = dto.modalidad;
    if (dto.meetingLink !== undefined) appt.meetingLink = dto.meetingLink;
    if (dto.followUpNotes !== undefined) appt.followUpNotes = dto.followUpNotes;
    if (dto.rescheduledFromId !== undefined) {
      if (dto.rescheduledFromId === appt.id) {
        throw new BadRequestException(
          'Una cita no puede ser reagendamiento de sí misma',
        );
      }
      appt.rescheduledFromId = dto.rescheduledFromId;
    }

    // ── Cambio de estado ─────────────────────────────────────────
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
    if (appt.estado === 'cancelada' || appt.estado === 'realizada') {
      throw new BadRequestException(
        `No se puede cancelar una cita ${appt.estado}`,
      );
    }

    appt.estado = 'cancelada';
    appt.cancelledAt = new Date();
    appt.cancelledById = caller.id;
    appt.cancelReason = dto.reason ?? null;
    return this.appointmentRepo.save(appt);
  }

  // ════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
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
    if (
      caller.rol === 'alumno' &&
      appt.studentId &&
      appt.studentId === caller.id
    )
      return;
    if (caller.rol === 'padre' && appt.parentId && appt.parentId === caller.id)
      return;
    throw new ForbiddenException('No tienes acceso a esta cita');
  }

  private assertStateTransition(
    caller: CallerContext,
    appt: Appointment,
    next: Appointment['estado'],
  ): void {
    // Reglas:
    // - Cancelada no puede pasar a otro estado
    // - Realizada / no_asistio solo lo marca el convocado_a o admin (la "psicóloga/docente que recibió")
    if (appt.estado === 'cancelada') {
      throw new BadRequestException(
        'Una cita cancelada no puede cambiar de estado',
      );
    }
    if (next === 'realizada' || next === 'no_asistio') {
      if (caller.rol !== 'admin' && appt.convocadoAId !== caller.id) {
        throw new ForbiddenException(
          'Solo el convocado puede marcar la cita como realizada/no asistió',
        );
      }
    }
  }

  private async assertCanInvolveStudent(
    caller: CallerContext,
    studentId: string,
  ): Promise<void> {
    // Reglas por rol del convocador:
    switch (caller.rol) {
      case 'admin':
      case 'psicologa':
      case 'docente':
      case 'auxiliar':
        return; // pueden agendar sobre cualquier alumno

      case 'padre': {
        const linked = await this.dataSource.query(
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
    const linked = await this.dataSource.query(
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
    psychologistId: string,
    start: Date,
    durationMin: number,
    ignoreAppointmentId?: string,
  ): Promise<void> {
    const end = new Date(start.getTime() + durationMin * 60_000);

    const dayName = WEEK_DAYS[start.getDay()];

    // Domingo no es atendido (no existe en el enum WeekDay ni en la BD)
    if (dayName === 'domingo') {
      throw new BadRequestException('La psicóloga no atiende los domingos');
    }

    const availability = await this.availabilityRepo.findOne({
      where: { psychologistId, weekDay: dayName, activo: true },
    });
    if (!availability) {
      throw new BadRequestException('La psicóloga no atiende ese día');
    }

    const [hS, mS] = availability.startTime.split(':').map(Number);
    const [hE, mE] = availability.endTime.split(':').map(Number);

    const dayStart = new Date(start);
    dayStart.setHours(hS, mS, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(hE, mE, 0, 0);

    if (start < dayStart || end > dayEnd) {
      throw new BadRequestException(
        `Horario fuera de la disponibilidad (${availability.startTime}-${availability.endTime})`,
      );
    }

    // Bloqueos vacacionales
    const blocked = await this.blockRepo
      .createQueryBuilder('b')
      .where('b.psicologa_id = :pid', { pid: psychologistId })
      .andWhere('b.fecha_inicio <= :end AND b.fecha_fin >= :start', {
        start,
        end,
      })
      .getCount();
    if (blocked > 0) {
      throw new BadRequestException(
        'La psicóloga tiene un bloqueo en ese rango',
      );
    }

    // Doble-booking
    const overlapQB = this.appointmentRepo
      .createQueryBuilder('a')
      .where('a.convocado_a_id = :pid', { pid: psychologistId })
      .andWhere('a.estado IN (:...states)', {
        states: ['pendiente', 'confirmada'],
      })
      .andWhere(
        `
                tstzrange(a.fecha_hora,
                          a.fecha_hora + (a.duracion_min || ' minutes')::interval,
                          '[)')
                && tstzrange(:start, :end, '[)')
            `,
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

  private async upsertAssignment(
    em: any,
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

  /**
   * Enriquece cada cita con el nombre real del `convocadoA`. La tabla
   * `cuentas` no guarda nombre/apellido (esos viven en `psicologas`,
   * `alumnos`, `padres`, `docentes`, `auxiliares`, `admins`); por eso
   * `leftJoinAndSelect('a.convocadoA', ...)` deja esos campos `undefined`.
   *
   * Hacemos UNA sola consulta UNION sobre las 6 tablas de roles para
   * resolver todos los nombres en O(1) ronda de BD, sin tocar el schema.
   */
  private async enrichWithProfileNames(
    items: Appointment[],
  ): Promise<Appointment[]> {
    if (items.length === 0) return items;

    const ids = Array.from(
      new Set(items.map((a) => a.convocadoAId).filter(Boolean)),
    );
    if (ids.length === 0) return items;

    const rows = await this.dataSource.query<
      {
        id: string;
        nombre: string;
        apellido_paterno: string;
        apellido_materno: string | null;
      }[]
    >(
      `SELECT id, nombre, apellido_paterno, apellido_materno FROM psicologas WHERE id = ANY($1::uuid[])
              UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM alumnos    WHERE id = ANY($1::uuid[])
              UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM padres     WHERE id = ANY($1::uuid[])
              UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM docentes   WHERE id = ANY($1::uuid[])
              UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM auxiliares WHERE id = ANY($1::uuid[])
              UNION ALL
             SELECT id, nombre, apellido_paterno, apellido_materno FROM admins     WHERE id = ANY($1::uuid[])`,
      [ids],
    );

    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const a of items) {
      const profile = byId.get(a.convocadoAId);
      if (profile && a.convocadoA) {
        // Mutación segura: sólo agregamos campos que no existen en Cuenta.
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
