import {
    Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { PsychologistStudent } from './entities/psychologist-student.entity.js';
import { PsychologistAvailability } from './entities/psychologist-availability.entity.js';
import { PsychologistBlock } from './entities/psychologist-block.entity.js';
import { PsychologyRecord } from './entities/psychology-record.entity.js';
import {
    CreateRecordDto, UpdateRecordDto,
    CreateAvailabilityDto, CreateBlockDto, PageQueryDto,
} from './dto/psychology.dto.js';
import { UsersService } from '../users/users.service.js';
import { WEEK_DAY_BY_INDEX } from './psychology.types.js';

const DEFAULT_SLOT_MINUTES = 30;

@Injectable()
export class PsychologyService {
    private readonly logger = new Logger(PsychologyService.name);

    constructor(
        @InjectRepository(PsychologistStudent)      private readonly assignmentRepo: Repository<PsychologistStudent>,
        @InjectRepository(PsychologistAvailability) private readonly availabilityRepo: Repository<PsychologistAvailability>,
        @InjectRepository(PsychologistBlock)        private readonly blockRepo: Repository<PsychologistBlock>,
        @InjectRepository(PsychologyRecord)         private readonly recordRepo: Repository<PsychologyRecord>,
        private readonly dataSource: DataSource,
        private readonly usersService: UsersService,
    ) { }

    // ════════════════════════════════════════════════════════════════
    // FICHAS PSICOLÓGICAS
    // ════════════════════════════════════════════════════════════════

    async createRecord(psychologistId: string, dto: CreateRecordDto): Promise<PsychologyRecord> {
        return this.dataSource.transaction(async (em) => {
            // Auto-asignar al primer contacto
            await em.query(
                `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde)
                 VALUES ($1, $2, TRUE, CURRENT_DATE)
                 ON CONFLICT (psicologa_id, alumno_id)
                 DO UPDATE SET activo = TRUE, hasta = NULL`,
                [psychologistId, dto.studentId],
            );
            const record = em.create(PsychologyRecord, { ...dto, psychologistId });
            return em.save(record);
        });
    }

    async getRecordsByStudent(
        psychologistId: string,
        studentId: string,
        q: PageQueryDto,
    ) {
        await this.assertAssigned(psychologistId, studentId);
        const page  = q.page  ?? 1;
        const limit = q.limit ?? 25;

        const [items, total] = await this.recordRepo.findAndCount({
            where: { studentId },
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async updateRecord(psychologistId: string, recordId: string, dto: UpdateRecordDto): Promise<PsychologyRecord> {
        const record = await this.recordRepo.findOne({ where: { id: recordId } });
        if (!record) throw new NotFoundException('Ficha no encontrada');
        if (record.psychologistId !== psychologistId) throw new ForbiddenException('Acceso denegado');
        Object.assign(record, dto);
        return this.recordRepo.save(record);
    }

    async deleteRecord(psychologistId: string, recordId: string): Promise<void> {
        const record = await this.recordRepo.findOne({ where: { id: recordId } });
        if (!record) throw new NotFoundException('Ficha no encontrada');
        if (record.psychologistId !== psychologistId) throw new ForbiddenException('Acceso denegado');
        await this.recordRepo.remove(record);
    }

    // ════════════════════════════════════════════════════════════════
    // DISPONIBILIDAD
    // ════════════════════════════════════════════════════════════════

    async setAvailability(psychologistId: string, dto: CreateAvailabilityDto): Promise<PsychologistAvailability> {
        if (dto.endTime <= dto.startTime) {
            throw new BadRequestException('endTime debe ser mayor que startTime');
        }
        const existing = await this.availabilityRepo.findOne({
            where: { psychologistId, weekDay: dto.weekDay },
        });
        if (existing) {
            existing.startTime = dto.startTime;
            existing.endTime   = dto.endTime;
            existing.activo    = true;
            return this.availabilityRepo.save(existing);
        }
        return this.availabilityRepo.save(
            this.availabilityRepo.create({ ...dto, psychologistId }),
        );
    }

    async getAvailability(psychologistId: string): Promise<PsychologistAvailability[]> {
        return this.availabilityRepo.find({
            where: { psychologistId, activo: true },
            order: { weekDay: 'ASC' },
        });
    }

    async removeAvailability(psychologistId: string, id: string): Promise<void> {
        const availability = await this.availabilityRepo.findOne({ where: { id, psychologistId } });
        if (!availability) throw new NotFoundException('Disponibilidad no encontrada');
        availability.activo = false;
        await this.availabilityRepo.save(availability);
    }

    // ════════════════════════════════════════════════════════════════
    // BLOQUEOS
    // ════════════════════════════════════════════════════════════════

    async createBlock(psychologistId: string, dto: CreateBlockDto): Promise<PsychologistBlock> {
        const startDate = new Date(dto.startDate);
        const endDate   = new Date(dto.endDate);
        if (endDate <= startDate) {
            throw new BadRequestException('endDate debe ser mayor que startDate');
        }
        return this.blockRepo.save(this.blockRepo.create({
            psychologistId, startDate, endDate, motivo: dto.motivo ?? null,
        }));
    }

    async getBlocks(psychologistId: string, from?: string, to?: string): Promise<PsychologistBlock[]> {
        const where: any = { psychologistId };
        if (from) where.endDate   = MoreThanOrEqual(new Date(from));
        if (to)   where.startDate = LessThanOrEqual(new Date(to));
        return this.blockRepo.find({ where, order: { startDate: 'ASC' } });
    }

    async removeBlock(psychologistId: string, id: string): Promise<void> {
        const block = await this.blockRepo.findOne({ where: { id, psychologistId } });
        if (!block) throw new NotFoundException('Bloqueo no encontrado');
        await this.blockRepo.remove(block);
    }

    // ════════════════════════════════════════════════════════════════
    // SLOTS DISPONIBLES (lo que ve el padre/alumno para agendar)
    // ════════════════════════════════════════════════════════════════

    async getAvailableSlots(
        psychologistId: string,
        from: Date,
        to: Date,
        slotMinutes: number = DEFAULT_SLOT_MINUTES,
    ): Promise<Date[]> {
        if (to <= from) throw new BadRequestException('Rango inválido');
        // Tope para no generar miles de slots por error
        const maxRangeMs = 1000 * 60 * 60 * 24 * 60; // 60 días
        if (to.getTime() - from.getTime() > maxRangeMs) {
            throw new BadRequestException('El rango no puede ser mayor a 60 días');
        }

        // Las consultas se hacen en paralelo, pero envolvemos las que pueden
        // fallar por desfase de schema con un fallback explícito (mejor mostrar
        // pantalla vacía que romper toda la solicitud de citas).
        const [availability, blocks, bookedRaw] = await Promise.all([
            this.availabilityRepo.find({ where: { psychologistId, activo: true } }),
            this.blockRepo.find({
                where: {
                    psychologistId,
                    startDate: LessThanOrEqual(to),
                    endDate:   MoreThanOrEqual(from),
                },
                select: ['startDate', 'endDate'],
            }),
            this.queryBookedAppointments(psychologistId, from, to),
        ]);

        // Coerción defensiva: pg puede devolver timestamps como string según
        // configuración del driver. Normalizamos a Date + number una sola vez.
        const booked = bookedRaw.map((b) => ({
            start: toDate(b.fecha_hora),
            durationMin: Number(b.duracion_min) || DEFAULT_SLOT_MINUTES,
        }));
        const blocksNorm = blocks.map((b) => ({
            start: toDate(b.startDate),
            end:   toDate(b.endDate),
        }));

        const slots: Date[] = [];
        const now = new Date();
        const cursor = new Date(from);
        cursor.setHours(0, 0, 0, 0);

        while (cursor <= to) {
            const dayName = WEEK_DAY_BY_INDEX[cursor.getDay()];
            const dayAvail = availability.find(a => a.weekDay === dayName);
            if (dayAvail) {
                const [hS, mS] = dayAvail.startTime.split(':').map(Number);
                const [hE, mE] = dayAvail.endTime.split(':').map(Number);

                const dayStart = new Date(cursor); dayStart.setHours(hS, mS, 0, 0);
                const dayEnd   = new Date(cursor); dayEnd.setHours(hE, mE, 0, 0);

                let slotStart = new Date(dayStart);
                while (slotStart.getTime() + slotMinutes * 60_000 <= dayEnd.getTime()) {
                    const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60_000);

                    if (slotStart > now && slotStart >= from && slotEnd <= to) {
                        const isBlocked = blocksNorm.some(b =>
                            slotStart < b.end && slotEnd > b.start,
                        );
                        const isBooked = booked.some(b => {
                            const bEnd = new Date(b.start.getTime() + b.durationMin * 60_000);
                            return slotStart < bEnd && slotEnd > b.start;
                        });
                        if (!isBlocked && !isBooked) slots.push(new Date(slotStart));
                    }
                    slotStart = new Date(slotStart.getTime() + slotMinutes * 60_000);
                }
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        return slots;
    }

    /**
     * Trae las citas activas dirigidas a la psicóloga en el rango. Si la BD
     * no tiene aún el schema `convocado_a_id` (o cualquier otro fallo de
     * consulta), no rompemos la pantalla: registramos y devolvemos vacío.
     */
    private async queryBookedAppointments(
        psychologistId: string, from: Date, to: Date,
    ): Promise<Array<{ fecha_hora: unknown; duracion_min: unknown }>> {
        try {
            // Importante: casteamos los bind params a `timestamptz`.
            // Sin el cast, Postgres infiere el tipo del lado derecho
            // (`$2 - INTERVAL '3 hours'`) como `interval` y termina
            // intentando comparar `timestamptz >= interval` (operador que no
            // existe). Con `$2::timestamptz` la resta queda timestamptz y la
            // comparación es válida.
            return await this.dataSource.query(
                `SELECT fecha_hora, duracion_min
                   FROM citas
                  WHERE convocado_a_id = $1
                    AND estado IN ('pendiente','confirmada')
                    AND fecha_hora >= $2::timestamptz - INTERVAL '3 hours'
                    AND fecha_hora <= $3::timestamptz
                  ORDER BY fecha_hora`,
                [psychologistId, from, to],
            );
        } catch (err) {
            this.logger.error(
                `getAvailableSlots: error consultando citas activas: ${(err as Error).message}`,
            );
            return [];
        }
    }

    // ════════════════════════════════════════════════════════════════
    // ASIGNACIONES (vista de la psicóloga: mis alumnos)
    // ════════════════════════════════════════════════════════════════

    async getMyStudents(psychologistId: string, q: PageQueryDto) {
        const page  = q.page  ?? 1;
        const limit = q.limit ?? 50;
        const offset = (page - 1) * limit;

        const [{ count }] = await this.dataSource.query(
            `SELECT COUNT(*)::int AS count FROM psicologa_alumno
              WHERE psicologa_id = $1 AND activo = TRUE`,
            [psychologistId],
        );

        const rows = await this.dataSource.query(
            `SELECT
                a.id,
                a.codigo_estudiante,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                TRIM(CONCAT(a.apellido_paterno, ' ', COALESCE(a.apellido_materno, ''))) AS apellidos,
                pa.activo, pa.desde, pa.hasta
             FROM psicologa_alumno pa
             INNER JOIN alumnos a ON a.id = pa.alumno_id
             WHERE pa.psicologa_id = $1 AND pa.activo = TRUE
             ORDER BY a.apellido_paterno, a.nombre
             LIMIT $2 OFFSET $3`,
            [psychologistId, limit, offset],
        );
        return { data: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
    }

    async unassignStudent(psychologistId: string, studentId: string): Promise<void> {
        const assignment = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId, activo: true },
        });
        if (!assignment) throw new NotFoundException('Asignación no encontrada');
        assignment.activo = false;
        assignment.hasta  = new Date().toISOString().split('T')[0];
        await this.assignmentRepo.save(assignment);
    }

    // ════════════════════════════════════════════════════════════════
    // DIRECTORIO (reusa UsersService — sanitizado)
    // ════════════════════════════════════════════════════════════════

    async searchStudents(query: string) {
        const rows = await this.usersService.searchAlumnos(query);
        return rows.map((r: any) => this.stripCredentials(r));
    }

    async listStudents(q: { search?: string; page?: number; limit?: number }) {
        const result = await this.usersService.findAlumnos({
            q: q.search,
            page:  q.page  ?? 1,
            limit: q.limit ?? 50,
        });
        result.data = result.data.map((r: any) => this.stripCredentials(r));
        return result;
    }

    async searchParents(query: string) {
        const rows = await this.usersService.searchPadres(query);
        return rows.map((r: any) => this.stripCredentials(r));
    }

    async getStudentParents(studentId: string) {
        const rows = await this.dataSource.query(
            `SELECT p.id, p.nombre, p.apellido_paterno, p.apellido_materno,
                    p.relacion, p.email, p.telefono
             FROM padre_alumno pa
             JOIN padres  p ON p.id = pa.padre_id
             JOIN cuentas c ON c.id = p.id AND c.activo = TRUE
             WHERE pa.alumno_id = $1
             ORDER BY p.apellido_paterno, p.nombre`,
            [studentId],
        );
        return rows;
    }

    /**
     * Lista pública de psicólogas activas. La usan padre/alumno para saber
     * a qué psicóloga pueden agendar una cita. Devuelve sólo datos sanitizados
     * (sin credenciales). Si pasan `q`, filtra por nombre/apellido.
     */
    async listActivePsicologas(q?: string) {
        const term = (q ?? '').trim();
        const params: any[] = [];
        let where = `c.activo = TRUE`;
        if (term) {
            params.push(`%${term.toLowerCase()}%`);
            where += ` AND (
                LOWER(ps.nombre)            LIKE $1 OR
                LOWER(ps.apellido_paterno)  LIKE $1 OR
                LOWER(ps.apellido_materno)  LIKE $1
            )`;
        }
        return this.dataSource.query(
            `SELECT ps.id,
                    ps.nombre,
                    ps.apellido_paterno,
                    ps.apellido_materno,
                    ps.especialidad,
                    ps.email,
                    ps.telefono,
                    ps.foto_storage_key
               FROM psicologas ps
               JOIN cuentas    c ON c.id = ps.id
              WHERE ${where}
              ORDER BY ps.apellido_paterno, ps.nombre`,
            params,
        );
    }

    // ════════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════════

    /** Garantiza que la psicóloga atiende a este alumno (si no, auto-asigna o falla). */
    private async assertAssigned(psychologistId: string, studentId: string): Promise<void> {
        const exists = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId, activo: true },
            select: ['psychologistId'],
        });
        if (!exists) {
            throw new ForbiddenException('Este alumno no está asignado a tu lista');
        }
    }

    /** Quita campos sensibles antes de devolver al frontend (NUNCA exponer credenciales). */
    private stripCredentials<T extends Record<string, any>>(row: T): Omit<T, 'codigo_acceso' | 'numero_documento' | 'tipo_documento'> {
        const { codigo_acceso, numero_documento, tipo_documento, ...safe } = row;
        return safe as any;
    }
}

/** Convierte cualquier valor (Date | string | number) en Date válida. */
function toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    return new Date(NaN);
}
