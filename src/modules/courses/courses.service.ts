import {
    Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from './entities/course.entity.js';
import { Enrollment } from './entities/enrollment.entity.js';
import { Period } from '../academic/entities/period.entity.js';

@Injectable()
export class CoursesService {
    constructor(
        @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
        @InjectRepository(Enrollment) private readonly enrollmentRepo: Repository<Enrollment>,
        @InjectRepository(Period) private readonly periodRepo: Repository<Period>,
    ) { }

    // ── CURSOS ──────────────────────────────────────────────────────

    async findMyCourses(userId: string, rol: string) {
        if (rol === 'docente') {
            return this.courseRepo.find({
                where: { docente_id: userId, activo: true },
                relations: ['seccion', 'seccion.grado', 'periodo'],
                order: { nombre: 'ASC' },
            });
        }

        if (rol === 'alumno') {
            // Busca cursos por matrícula activa del alumno
            const enrollments = await this.enrollmentRepo.find({
                where: { alumno_id: userId, activo: true },
                relations: ['seccion'],
            });

            if (!enrollments.length) return [];

            const seccionIds = enrollments.map(e => e.seccion_id);
            const periodoActivo = await this.periodRepo.findOne({ where: { activo: true } });
            if (!periodoActivo) return [];

            return this.courseRepo
                .createQueryBuilder('c')
                .leftJoinAndSelect('c.seccion', 's')
                .leftJoinAndSelect('s.grado', 'g')
                .leftJoinAndSelect('c.periodo', 'p')
                .leftJoinAndSelect('c.docente', 'd')
                .where('c.seccion_id IN (:...ids)', { ids: seccionIds })
                .andWhere('c.periodo_id = :pid', { pid: periodoActivo.id })
                .andWhere('c.activo = true')
                .orderBy('c.nombre', 'ASC')
                .getMany();
        }

        // Admin ve todos
        return this.courseRepo.find({
            where: { activo: true },
            relations: ['seccion', 'seccion.grado', 'periodo', 'docente'],
            order: { nombre: 'ASC' },
        });
    }

    async findOne(id: string) {
        const course = await this.courseRepo.findOne({
            where: { id, activo: true },
            relations: ['seccion', 'seccion.grado', 'periodo', 'docente'],
        });
        if (!course) throw new NotFoundException(`Curso ${id} no encontrado`);
        return course;
    }

    async create(dto: {
        nombre: string;
        descripcion?: string;
        docente_id: string;
        seccion_id: number;
        periodo_id: number;
    }) {
        const course = this.courseRepo.create(dto);
        return this.courseRepo.save(course);
    }

    async update(id: string, docenteId: string, rol: string, dto: Partial<{
        nombre: string;
        descripcion: string;
    }>) {
        const course = await this.courseRepo.findOne({ where: { id, activo: true } });
        if (!course) throw new NotFoundException(`Curso ${id} no encontrado`);

        // Solo el docente dueño o admin puede editar
        if (rol === 'docente' && course.docente_id !== docenteId) {
            throw new ForbiddenException('No tienes permiso para editar este curso');
        }

        Object.assign(course, dto);
        return this.courseRepo.save(course);
    }

    // ── MATRICULAS ──────────────────────────────────────────────────

    async enrollStudent(alumnoId: string, seccionId: number, periodoId: number) {
        const existing = await this.enrollmentRepo.findOne({
            where: { alumno_id: alumnoId, seccion_id: seccionId, periodo_id: periodoId },
        });

        if (existing) {
            // Si estaba inactiva, la reactiva
            if (!existing.activo) {
                existing.activo = true;
                return this.enrollmentRepo.save(existing);
            }
            return existing;
        }

        const enrollment = this.enrollmentRepo.create({
            alumno_id: alumnoId,
            seccion_id: seccionId,
            periodo_id: periodoId,
        });
        return this.enrollmentRepo.save(enrollment);
    }

    async getEnrollmentsBySeccion(seccionId: number) {
        return this.enrollmentRepo.find({
            where: { seccion_id: seccionId, activo: true },
            relations: ['alumno'],
            order: { alumno: { apellido_paterno: 'ASC' } },
        });
    }
}