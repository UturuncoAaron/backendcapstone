import {
    Injectable, NotFoundException, ForbiddenException,
    BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Attendance } from './entities/attendance.entity.js';
import { Course } from '../courses/entities/course.entity.js';

@Injectable()
export class AssistsService {
    private readonly logger = new Logger(AssistsService.name);

    constructor(
        @InjectRepository(Attendance)
        private readonly attendanceRepo: Repository<Attendance>,
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
    ) { }

    // ── Helpers ─────────────────────────────────────────────────

    /** Verifica que el usuario sea el docente titular del curso. */
    private async assertDocenteDelCurso(cursoId: string, docenteId: string) {
        const curso = await this.courseRepo.findOne({ where: { id: cursoId } });
        if (!curso) throw new NotFoundException(`Curso ${cursoId} no encontrado`);
        if (curso.docente_id !== docenteId) {
            throw new ForbiddenException('Solo el docente del curso puede gestionar asistencias');
        }
        return curso;
    }

    // ── Lecturas ────────────────────────────────────────────────

    /** Lista asistencias de un curso en una fecha exacta. */
    async getByCursoFecha(cursoId: string, fecha: string) {
        return this.attendanceRepo.find({
            where: { curso_id: cursoId, fecha },
            relations: ['alumno'],
            order: { created_at: 'ASC' },
        });
    }

    /** Lista asistencias de un curso en un rango (o todo el histórico). */
    async getByCurso(cursoId: string, desde?: string, hasta?: string) {
        const where: any = { curso_id: cursoId };
        if (desde && hasta) where.fecha = Between(desde, hasta);
        return this.attendanceRepo.find({
            where,
            relations: ['alumno'],
            order: { fecha: 'DESC', created_at: 'ASC' },
        });
    }

    /** Histórico de un alumno (opcional filtrar por curso y rango). */
    async getByAlumno(alumnoId: string, cursoId?: string, desde?: string, hasta?: string) {
        const qb = this.attendanceRepo.createQueryBuilder('a')
            .leftJoinAndSelect('a.curso', 'c')
            .where('a.alumno_id = :alumnoId', { alumnoId });

        if (cursoId) qb.andWhere('a.curso_id = :cursoId', { cursoId });
        if (desde) qb.andWhere('a.fecha >= :desde', { desde });
        if (hasta) qb.andWhere('a.fecha <= :hasta', { hasta });

        return qb.orderBy('a.fecha', 'DESC').getMany();
    }

    async findOne(id: string) {
        const asistencia = await this.attendanceRepo.findOne({
            where: { id },
            relations: ['alumno', 'curso'],
        });
        if (!asistencia) throw new NotFoundException(`Asistencia ${id} no encontrada`);
        return asistencia;
    }

    // ── Escrituras ──────────────────────────────────────────────

    /**
     * Upsert por (alumno, curso, fecha).
     * Solo el docente titular del curso puede registrar.
     */
    async register(dto: {
        curso_id: string;
        alumno_id: string;
        fecha: string;
        presente: boolean;
        justificacion?: string;
    }, docenteId: string) {
        await this.assertDocenteDelCurso(dto.curso_id, docenteId);

        const existing = await this.attendanceRepo.findOne({
            where: {
                alumno_id: dto.alumno_id,
                curso_id: dto.curso_id,
                fecha: dto.fecha,
            },
        });

        if (existing) {
            existing.presente = dto.presente;
            existing.justificacion = dto.justificacion ?? null;
            existing.registrado_por = docenteId;
            return this.attendanceRepo.save(existing);
        }

        const asistencia = this.attendanceRepo.create({
            curso_id: dto.curso_id,
            alumno_id: dto.alumno_id,
            fecha: dto.fecha,
            presente: dto.presente,
            justificacion: dto.justificacion ?? null,
            registrado_por: docenteId,
        });
        return this.attendanceRepo.save(asistencia);
    }

    /** Registrar asistencia diaria a varios alumnos del curso de una vez. */
    async registerBulk(dto: {
        curso_id: string;
        fecha: string;
        alumnos: { alumno_id: string; presente: boolean; justificacion?: string }[];
    }, docenteId: string) {
        await this.assertDocenteDelCurso(dto.curso_id, docenteId);

        if (!dto.alumnos?.length) {
            throw new BadRequestException('Se requiere al menos un alumno');
        }

        const results = await Promise.all(
            dto.alumnos.map(a => this.register({
                curso_id: dto.curso_id,
                fecha: dto.fecha,
                alumno_id: a.alumno_id,
                presente: a.presente,
                justificacion: a.justificacion,
            }, docenteId)),
        );

        this.logger.log(
            `Asistencia bulk: ${results.length} alumnos | curso ${dto.curso_id} | fecha ${dto.fecha}`,
        );
        return { registrados: results.length, asistencias: results };
    }

    /** Editar una asistencia puntual (presente o justificación). */
    async update(
        id: string,
        dto: Partial<{ presente: boolean; justificacion: string | null }>,
        docenteId: string,
    ) {
        const asistencia = await this.findOne(id);
        await this.assertDocenteDelCurso(asistencia.curso_id, docenteId);

        Object.assign(asistencia, dto);
        asistencia.registrado_por = docenteId;
        return this.attendanceRepo.save(asistencia);
    }

    async remove(id: string, docenteId: string) {
        const asistencia = await this.findOne(id);
        await this.assertDocenteDelCurso(asistencia.curso_id, docenteId);
        await this.attendanceRepo.remove(asistencia);
        return { message: 'Asistencia eliminada correctamente' };
    }
}