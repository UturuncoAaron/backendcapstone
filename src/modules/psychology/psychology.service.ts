import {
    Injectable, NotFoundException,
    ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Psicologa } from '../users/entities/psicologa.entity.js';
import { PsychologistStudent } from './entities/psychologist-student.entity.js';
import { PsychologistAvailability } from './entities/psychologist-availability.entity.js';
import { PsychologistBlock } from './entities/psychologist-block.entity.js';
import { PsychologyRecord } from './entities/psychology-record.entity.js';
import { Appointment } from './entities/appointment.entity.js';
import {
    CreateRecordDto, UpdateRecordDto,
    CreateAppointmentDto, UpdateAppointmentDto,
    CreateAvailabilityDto, CreateBlockDto,
} from './dto/psychology.dto.js';

@Injectable()
export class PsychologyService {

    constructor(
        @InjectRepository(Psicologa) private psychologistRepo: Repository<Psicologa>,
        @InjectRepository(PsychologistStudent) private assignmentRepo: Repository<PsychologistStudent>,
        @InjectRepository(PsychologistAvailability) private availabilityRepo: Repository<PsychologistAvailability>,
        @InjectRepository(PsychologistBlock) private blockRepo: Repository<PsychologistBlock>,
        @InjectRepository(PsychologyRecord) private recordRepo: Repository<PsychologyRecord>,
        @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
        private readonly dataSource: DataSource,
    ) { }

    // ════════════════════════════════════════════════════════════
    // PSYCHOLOGY RECORDS — solo psicóloga asignada
    // ════════════════════════════════════════════════════════════

    async createRecord(psychologistId: string, dto: CreateRecordDto): Promise<PsychologyRecord> {
        await this.assertAssigned(psychologistId, dto.studentId);
        const record = this.recordRepo.create({ ...dto, psychologistId });
        return this.recordRepo.save(record);
    }

    async getRecordsByStudent(psychologistId: string, studentId: string): Promise<PsychologyRecord[]> {
        await this.assertAssigned(psychologistId, studentId);
        return this.recordRepo.find({
            where: { studentId },
            order: { createdAt: 'DESC' },
        });
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

    // ════════════════════════════════════════════════════════════
    // APPOINTMENTS
    // ════════════════════════════════════════════════════════════

    async createAppointment(createdById: string, dto: CreateAppointmentDto): Promise<Appointment> {
        const scheduledAt = new Date(dto.scheduledAt);
        if (scheduledAt < new Date()) {
            throw new BadRequestException('La fecha de la cita no puede ser en el pasado');
        }
        const appointment = this.appointmentRepo.create({
            ...dto,
            scheduledAt,
            createdById,
            durationMin: dto.durationMin ?? 30,
        });
        return this.appointmentRepo.save(appointment);
    }

    async getMyAppointments(createdById: string): Promise<Appointment[]> {
        return this.appointmentRepo.find({
            where: { createdById },
            relations: ['parent', 'student'],
            order: { scheduledAt: 'DESC' },
        });
    }

    async getAppointmentsByParent(parentId: string): Promise<Appointment[]> {
        return this.appointmentRepo.find({
            where: { parentId },
            relations: ['student'],
            order: { scheduledAt: 'DESC' },
        });
    }

    async getAppointmentsByStudent(studentId: string): Promise<Appointment[]> {
        return this.appointmentRepo.find({
            where: { studentId },
            order: { scheduledAt: 'DESC' },
        });
    }

    async updateAppointment(id: string, createdById: string, dto: UpdateAppointmentDto): Promise<Appointment> {
        const appointment = await this.appointmentRepo.findOne({ where: { id } });
        if (!appointment) throw new NotFoundException('Cita no encontrada');
        if (appointment.createdById !== createdById) {
            throw new ForbiddenException('Solo quien creó la cita puede modificarla');
        }
        if (dto.scheduledAt) appointment.scheduledAt = new Date(dto.scheduledAt);
        Object.assign(appointment, dto);
        return this.appointmentRepo.save(appointment);
    }

    // ════════════════════════════════════════════════════════════
    // AVAILABILITY
    // ════════════════════════════════════════════════════════════

    async setAvailability(psychologistId: string, dto: CreateAvailabilityDto): Promise<PsychologistAvailability> {
        const existing = await this.availabilityRepo.findOne({
            where: { psychologistId, weekDay: dto.weekDay },
        });
        if (existing) {
            Object.assign(existing, dto);
            existing.activo = true;
            return this.availabilityRepo.save(existing);
        }
        const availability = this.availabilityRepo.create({ ...dto, psychologistId });
        return this.availabilityRepo.save(availability);
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

    // ════════════════════════════════════════════════════════════
    // BLOCKS
    // ════════════════════════════════════════════════════════════

    async createBlock(psychologistId: string, dto: CreateBlockDto): Promise<PsychologistBlock> {
        const block = this.blockRepo.create({
            ...dto,
            psychologistId,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
        });
        return this.blockRepo.save(block);
    }

    async getBlocks(psychologistId: string): Promise<PsychologistBlock[]> {
        return this.blockRepo.find({
            where: { psychologistId },
            order: { startDate: 'ASC' },
        });
    }

    async removeBlock(psychologistId: string, id: string): Promise<void> {
        const block = await this.blockRepo.findOne({ where: { id, psychologistId } });
        if (!block) throw new NotFoundException('Bloqueo no encontrado');
        await this.blockRepo.remove(block);
    }

    // ════════════════════════════════════════════════════════════
    // AVAILABLE SLOTS — lo que ve el padre para agendar
    // ════════════════════════════════════════════════════════════

    async getAvailableSlots(psychologistId: string, from: Date, to: Date): Promise<Date[]> {
        const weekDays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

        const [availability, blocks, bookedAppointments] = await Promise.all([
            this.availabilityRepo.find({ where: { psychologistId, activo: true } }),
            this.blockRepo.find({
                where: {
                    psychologistId,
                    startDate: LessThanOrEqual(to),
                    endDate: MoreThanOrEqual(from),
                },
            }),
            this.appointmentRepo.find({
                where: {
                    createdById: psychologistId,
                    scheduledAt: Between(from, to),
                },
                select: ['scheduledAt', 'durationMin'],
            }),
        ]);

        const slots: Date[] = [];
        const cursor = new Date(from);
        const now = new Date();

        while (cursor <= to) {
            const dayName = weekDays[cursor.getDay()];
            const dayAvailability = availability.find(a => a.weekDay === dayName);

            if (dayAvailability) {
                const [hStart, mStart] = dayAvailability.startTime.split(':').map(Number);
                const [hEnd, mEnd] = dayAvailability.endTime.split(':').map(Number);

                let slotTime = new Date(cursor);
                slotTime.setHours(hStart, mStart, 0, 0);

                const endTime = new Date(cursor);
                endTime.setHours(hEnd, mEnd, 0, 0);

                while (slotTime < endTime) {
                    const slotEnd = new Date(slotTime.getTime() + 30 * 60_000);

                    const isBlocked = blocks.some(b => slotTime >= b.startDate && slotTime < b.endDate);
                    const isBooked = bookedAppointments.some(a => {
                        const apptEnd = new Date(a.scheduledAt.getTime() + a.durationMin * 60_000);
                        return slotTime < apptEnd && slotEnd > a.scheduledAt;
                    });

                    if (!isBlocked && !isBooked && slotTime > now) {
                        slots.push(new Date(slotTime));
                    }

                    slotTime = slotEnd;
                }
            }

            cursor.setDate(cursor.getDate() + 1);
        }

        return slots;
    }

    // ════════════════════════════════════════════════════════════
    // ASSIGNMENTS
    // ════════════════════════════════════════════════════════════

    async assignStudent(psychologistId: string, studentId: string): Promise<PsychologistStudent> {
        const existing = await this.assignmentRepo.findOne({ where: { psychologistId, studentId } });
        if (existing) {
            existing.activo = true;
            existing.hasta = null;
            return this.assignmentRepo.save(existing);
        }
        return this.assignmentRepo.save(
            this.assignmentRepo.create({ psychologistId, studentId }),
        );
    }

    async unassignStudent(psychologistId: string, studentId: string): Promise<void> {
        const assignment = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId, activo: true },
        });
        if (!assignment) throw new NotFoundException('Asignación no encontrada');
        assignment.activo = false;
        assignment.hasta = new Date().toISOString().split('T')[0];
        await this.assignmentRepo.save(assignment);
    }

    async getStudentsOfPsychologist(psychologistId: string) {
        return this.dataSource.query(
            `SELECT
                a.id,
                a.codigo_estudiante,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                TRIM(CONCAT(a.apellido_paterno, ' ',
                            COALESCE(a.apellido_materno, ''))) AS apellidos,
                pa.activo,
                pa.desde,
                pa.hasta
             FROM psicologa_alumno pa
             INNER JOIN alumnos a ON a.id = pa.alumno_id
             WHERE pa.psicologa_id = $1 AND pa.activo = true
             ORDER BY a.apellido_paterno, a.nombre`,
            [psychologistId],
        );
    }

    async getStudentParents(psychologistId: string, studentId: string) {
        await this.assertAssigned(psychologistId, studentId);
        return this.dataSource.query(
            `SELECT
                p.id,
                p.nombre,
                p.apellido_paterno,
                p.apellido_materno,
                p.relacion,
                p.email,
                p.telefono,
                c.codigo_acceso
             FROM padre_alumno pa
             JOIN padres  p ON p.id = pa.padre_id
             JOIN cuentas c ON c.id = p.id AND c.activo = true
             WHERE pa.alumno_id = $1
             ORDER BY p.apellido_paterno, p.nombre`,
            [studentId],
        );
    }

    // ════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ════════════════════════════════════════════════════════════

    private async assertAssigned(psychologistId: string, studentId: string): Promise<void> {
        const assignment = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId, activo: true },
            select: ['psychologistId'],
        });
        if (!assignment) {
            throw new ForbiddenException('Este alumno no está asignado a tu lista');
        }
    }
}