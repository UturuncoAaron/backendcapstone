import {
    Injectable, NotFoundException,
    ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Psychologist } from './entities/psychologist.entity.js';
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
        @InjectRepository(Psychologist) private psychologistRepo: Repository<Psychologist>,
        @InjectRepository(PsychologistStudent) private assignmentRepo: Repository<PsychologistStudent>,
        @InjectRepository(PsychologistAvailability) private availabilityRepo: Repository<PsychologistAvailability>,
        @InjectRepository(PsychologistBlock) private blockRepo: Repository<PsychologistBlock>,
        @InjectRepository(PsychologyRecord) private recordRepo: Repository<PsychologyRecord>,
        @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
        private readonly dataSource: DataSource,
    ) { }

    // ════════════════════════════════════════════════════════════
    // PSYCHOLOGY RECORDS — only assigned psychologist
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
        if (!record) throw new NotFoundException('Record not found');
        if (record.psychologistId !== psychologistId) throw new ForbiddenException('Access denied');
        Object.assign(record, dto);
        return this.recordRepo.save(record);
    }

    async deleteRecord(psychologistId: string, recordId: string): Promise<void> {
        const record = await this.recordRepo.findOne({ where: { id: recordId } });
        if (!record) throw new NotFoundException('Record not found');
        if (record.psychologistId !== psychologistId) throw new ForbiddenException('Access denied');
        await this.recordRepo.remove(record);
    }

    // ════════════════════════════════════════════════════════════
    // APPOINTMENTS
    // ════════════════════════════════════════════════════════════

    async createAppointment(createdById: string, dto: CreateAppointmentDto): Promise<Appointment> {
        const scheduledAt = new Date(dto.scheduledAt);
        if (scheduledAt < new Date()) {
            throw new BadRequestException('Appointment date cannot be in the past');
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
        if (!appointment) throw new NotFoundException('Appointment not found');
        if (appointment.createdById !== createdById) {
            throw new ForbiddenException('Only the creator can modify this appointment');
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
        if (!availability) throw new NotFoundException('Availability not found');
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
        if (!block) throw new NotFoundException('Block not found');
        await this.blockRepo.remove(block);
    }

    // ════════════════════════════════════════════════════════════
    // AVAILABLE SLOTS — what the parent sees to book
    // ════════════════════════════════════════════════════════════

    async getAvailableSlots(psychologistId: string, from: Date, to: Date): Promise<Date[]> {
        const weekDays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

        const availability = await this.availabilityRepo.find({
            where: { psychologistId, activo: true },
        });

        const blocks = await this.blockRepo.find({
            where: {
                psychologistId,
                startDate: LessThanOrEqual(to),
                endDate: MoreThanOrEqual(from),
            },
        });

        const bookedAppointments = await this.appointmentRepo.find({
            where: {
                createdById: psychologistId,
                scheduledAt: Between(from, to),
            },
            select: ['scheduledAt', 'durationMin'],
        });

        const slots: Date[] = [];
        const cursor = new Date(from);

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
                    const slotEnd = new Date(slotTime.getTime() + 30 * 60000);

                    const isBlocked = blocks.some(b =>
                        slotTime >= b.startDate && slotTime < b.endDate,
                    );

                    const isBooked = bookedAppointments.some(a => {
                        const apptEnd = new Date(a.scheduledAt.getTime() + a.durationMin * 60000);
                        return slotTime < apptEnd && slotEnd > a.scheduledAt;
                    });

                    if (!isBlocked && !isBooked && slotTime > new Date()) {
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
        const existing = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId },
        });
        if (existing) {
            existing.activo = true;
            existing.hasta = null;
            return this.assignmentRepo.save(existing);
        }
        const assignment = this.assignmentRepo.create({ psychologistId, studentId });
        return this.assignmentRepo.save(assignment);
    }

    async unassignStudent(psychologistId: string, studentId: string): Promise<void> {
        const assignment = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId, activo: true },
        });
        if (!assignment) throw new NotFoundException('Assignment not found');
        assignment.activo = false;
        assignment.hasta = new Date().toISOString().split('T')[0];
        await this.assignmentRepo.save(assignment);
    }

    async getMyStudents(psychologistId: string) {
        return this.assignmentRepo.find({
            where: { psychologistId, activo: true },
            relations: ['student'],
        });
    }

    async getStudentsOfPsychologist(psychologistId: string) {
        return this.dataSource.query(
            `
            SELECT
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
            ORDER BY a.apellido_paterno, a.nombre
            `,
            [psychologistId],
        );
    }

    async getStudentParents(psychologistId: string, studentId: string) {
        await this.assertAssigned(psychologistId, studentId);
        return this.dataSource.query(
            `
            SELECT
                p.id,
                p.nombre,
                p.apellido_paterno,
                p.apellido_materno,
                p.relacion,
                p.email,
                p.telefono,
                c.codigo_acceso
            FROM padre_alumno pa
            JOIN padres p ON p.id = pa.padre_id
            JOIN cuentas c ON c.id = p.id AND c.activo = true
            WHERE pa.alumno_id = $1
            ORDER BY p.apellido_paterno, p.nombre
            `,
            [studentId],
        );
    }

    // ════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ════════════════════════════════════════════════════════════

    private async assertAssigned(psychologistId: string, studentId: string): Promise<void> {
        const assignment = await this.assignmentRepo.findOne({
            where: { psychologistId, studentId, activo: true },
        });
        if (!assignment) {
            throw new ForbiddenException('This student is not assigned to you');
        }
    }
}