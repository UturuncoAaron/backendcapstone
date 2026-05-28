import {
    Injectable, NotFoundException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Course } from './entities/course.entity.js';
import { Enrollment } from './entities/enrollment.entity.js';
import { CourseCatalog } from './entities/course-catalog.entity.js';
import { COLORES_SUGERIDOS } from './course-colors.js';

@Injectable()
export class CoursesService {
    constructor(
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
        @InjectRepository(Enrollment)
        private readonly enrollmentRepo: Repository<Enrollment>,
        @InjectRepository(CourseCatalog)
        private readonly catalogRepo: Repository<CourseCatalog>,
        private readonly dataSource: DataSource,
    ) { }

    // ── Catálogo ──────────────────────────────────────────────

    async findCatalog() {
        return this.catalogRepo.find({
            where: { activo: true },
            order: { nombre: 'ASC' },
        });
    }

    async createCatalogItem(dto: { nombre: string; area?: string; color?: string }) {
        const exists = await this.catalogRepo.findOne({
            where: { nombre: dto.nombre.trim() },
        });
        if (exists) throw new ConflictException(`El curso "${dto.nombre}" ya existe en el catálogo`);

        const item = this.catalogRepo.create({
            nombre: dto.nombre.trim(),
            area: dto.area?.trim() ?? null,
            color: dto.color ?? '#1976d2',
        });
        return this.catalogRepo.save(item);
    }

    async updateCatalogItem(
        id: string,
        dto: Partial<{ nombre: string; area: string; color: string; activo: boolean }>,
    ) {
        const item = await this.catalogRepo.findOne({ where: { id } });
        if (!item) throw new NotFoundException(`Curso de catálogo ${id} no encontrado`);
        Object.assign(item, dto);
        return this.catalogRepo.save(item);
    }

    // ── Colores sugeridos ─────────────────────────────────────

    getAvailableColors() {
        return COLORES_SUGERIDOS;
    }

    // ── Cursos ────────────────────────────────────────────────

    async findMyCourses(userId: string, rol: string, seccionId?: string, anio?: number) {
        const anioActual = anio ?? new Date().getFullYear();

        if (rol === 'docente') {
            return this.courseRepo
                .createQueryBuilder('c')
                .leftJoinAndSelect('c.seccion', 's')
                .leftJoinAndSelect('s.grado', 'g')
                .leftJoinAndSelect('c.catalogo', 'cat')
                .where('c.docente_id = :userId', { userId })
                .andWhere('c.activo = true')
                .andWhere('c.anio = :anio', { anio: anioActual })
                .orderBy('cat.nombre', 'ASC')
                .getMany();
        }

        if (rol === 'alumno') {
            const enrollments = await this.dataSource.query<{ seccion_id: string }[]>(
                `SELECT seccion_id FROM matriculas
                 WHERE alumno_id = $1 AND anio = $2 AND activo = TRUE`,
                [userId, anioActual],
            );
            if (!enrollments.length) return [];

            const seccionIds = enrollments.map(e => e.seccion_id);
            return this.courseRepo
                .createQueryBuilder('c')
                .leftJoinAndSelect('c.seccion', 's')
                .leftJoinAndSelect('s.grado', 'g')
                .leftJoinAndSelect('c.catalogo', 'cat')
                .leftJoinAndSelect('c.docente', 'd')
                .where('c.seccion_id IN (:...ids)', { ids: seccionIds })
                .andWhere('c.anio = :anio', { anio: anioActual })
                .andWhere('c.activo = true')
                .orderBy('cat.nombre', 'ASC')
                .getMany();
        }

        // Admin
        const query = this.courseRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.seccion', 's')
            .leftJoinAndSelect('s.grado', 'g')
            .leftJoinAndSelect('c.catalogo', 'cat')
            .leftJoinAndSelect('c.docente', 'd')
            .where('c.activo = true')
            .andWhere('c.anio = :anio', { anio: anioActual });

        if (seccionId) query.andWhere('c.seccion_id = :seccionId', { seccionId });

        return query.orderBy('cat.nombre', 'ASC').getMany();
    }

    async findOne(id: string) {
        const course = await this.courseRepo.findOne({
            where: { id, activo: true },
            relations: ['seccion', 'seccion.grado', 'catalogo', 'docente'],
        });
        if (!course) throw new NotFoundException(`Curso ${id} no encontrado`);
        return course;
    }

    async create(dto: {
        catalogo_id: string;
        descripcion?: string;
        docente_id?: string;
        seccion_id: string;
        anio: number;
        color?: string;
    }) {
        const catalogo = await this.catalogRepo.findOne({
            where: { id: dto.catalogo_id, activo: true },
        });
        if (!catalogo) throw new NotFoundException(`Curso de catálogo ${dto.catalogo_id} no encontrado`);

        const course = this.courseRepo.create({
            catalogo_id: dto.catalogo_id,
            descripcion: dto.descripcion ?? null,
            docente_id: dto.docente_id ?? null,
            seccion_id: dto.seccion_id,
            anio: dto.anio,
            color: dto.color ?? catalogo.color,
        });
        return this.courseRepo.save(course);
    }

    async update(
        id: string, docenteId: string, rol: string,
        dto: Partial<{ descripcion: string; activo: boolean; color: string }>,
    ) {
        const course = await this.courseRepo.findOne({ where: { id } });
        if (!course) throw new NotFoundException(`Curso ${id} no encontrado`);

        if (rol === 'docente' && course.docente_id !== docenteId) {
            throw new ForbiddenException('No tienes permiso para editar este curso');
        }

        Object.assign(course, dto);
        return this.courseRepo.save(course);
    }

    async assignTeacher(cursoId: string, docenteId: string) {
        const course = await this.courseRepo.findOne({
            where: { id: cursoId, activo: true },
            relations: ['catalogo'],
        });
        if (!course) throw new NotFoundException(`Curso ${cursoId} no encontrado`);

        const [docente] = await this.dataSource.query(
            `SELECT d.id, d.nombre, d.apellido_paterno
               FROM docentes d
               JOIN cuentas c ON c.id = d.id AND c.activo = true
              WHERE d.id = $1`,
            [docenteId],
        );
        if (!docente) throw new NotFoundException(`Docente ${docenteId} no encontrado`);

        course.docente_id = docenteId;
        await this.courseRepo.save(course);
        return {
            curso: course.catalogo.nombre,
            docente: `${docente.nombre} ${docente.apellido_paterno}`,
        };
    }

    // ── Matrículas ────────────────────────────────────────────

    async enrollStudent(alumnoId: string, seccionId: string, anio: number) {
        return this.dataSource.transaction(async (manager) => {
            await manager.query(
                `UPDATE matriculas
                 SET activo = FALSE
                 WHERE alumno_id = $1 AND anio = $2 AND seccion_id <> $3 AND activo = TRUE`,
                [alumnoId, anio, seccionId],
            );

            const [existing] = await manager.query<{ id: string; activo: boolean }[]>(
                `SELECT id, activo FROM matriculas
                 WHERE alumno_id = $1 AND anio = $2`,
                [alumnoId, anio],
            );

            if (existing) {
                if (!existing.activo) {
                    await manager.query(
                        `UPDATE matriculas SET activo = TRUE, seccion_id = $1 WHERE id = $2`,
                        [seccionId, existing.id],
                    );
                }
                const [row] = await manager.query(
                    `SELECT * FROM matriculas WHERE id = $1`, [existing.id],
                );
                return row;
            }

            const [created] = await manager.query(
                `INSERT INTO matriculas (alumno_id, seccion_id, anio, activo, fecha_matricula)
                 VALUES ($1, $2, $3, TRUE, CURRENT_DATE)
                 RETURNING *`,
                [alumnoId, seccionId, anio],
            );
            return created;
        });
    }

    async unenrollStudent(enrollmentId: string) {
        const [enrollment] = await this.dataSource.query<{ id: string }[]>(
            `SELECT id FROM matriculas WHERE id = $1 AND activo = TRUE`,
            [enrollmentId],
        );
        if (!enrollment) throw new NotFoundException(`Matrícula ${enrollmentId} no encontrada`);

        await this.dataSource.query(
            `UPDATE matriculas SET activo = FALSE WHERE id = $1`,
            [enrollmentId],
        );
        return { message: 'Alumno retirado de la sección' };
    }

    async getEnrollmentsBySeccion(seccionId: string, caller?: { id: string; rol: string }) {
        if (caller?.rol === 'alumno') {
            const anioActual = new Date().getFullYear();
            const [matriculado] = await this.dataSource.query(
                `SELECT id FROM matriculas
                 WHERE seccion_id = $1 AND alumno_id = $2 AND anio = $3 AND activo = TRUE`,
                [seccionId, caller.id, anioActual],
            );
            if (!matriculado) throw new ForbiddenException('No estás matriculado en esta sección');
        }

        const anio = new Date().getFullYear();
        const rows = await this.dataSource.query(
            `SELECT
                m.id, m.activo, m.fecha_matricula, m.anio,
                a.id               AS alumno_id,
                a.nombre, a.apellido_paterno, a.apellido_materno,
                a.codigo_estudiante, a.email, a.inclusivo
             FROM matriculas m
             JOIN alumnos a ON a.id = m.alumno_id
             WHERE m.seccion_id = $1 AND m.anio = $2 AND m.activo = TRUE
             ORDER BY a.apellido_paterno, a.nombre`,
            [seccionId, anio],
        );

        if (caller?.rol === 'alumno') return rows.map((r: any) => ({ ...r, email: null }));
        return rows;
    }
}