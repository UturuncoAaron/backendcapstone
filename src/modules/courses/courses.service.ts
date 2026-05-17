import {
    Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Course } from './entities/course.entity.js';
import { Enrollment } from './entities/enrollment.entity.js';
import { Period } from '../academic/entities/period.entity.js';
import { CURSOS_POR_GRADO, COLORES_CURSOS } from '../academic/course-template.js';

@Injectable()
export class CoursesService {
    constructor(
        @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
        @InjectRepository(Enrollment) private readonly enrollmentRepo: Repository<Enrollment>,
        @InjectRepository(Period) private readonly periodRepo: Repository<Period>,
        private readonly dataSource: DataSource,
    ) { }

    // ── Listas ────────────────────────────────────────────────

    async findMyCourses(userId: string, rol: string, seccionId?: string) {
        if (rol === 'docente') {
            return this.courseRepo.find({
                where: { docente_id: userId, activo: true },
                relations: ['seccion', 'seccion.grado', 'periodo'],
                order: { nombre: 'ASC' },
            });
        }

        if (rol === 'alumno') {
            // ── CAMBIO: Enrollment ya no tiene periodo_id, busca por anio ──
            const anioActual = new Date().getFullYear();
            const enrollments = await this.dataSource.query<{ seccion_id: string }[]>(
                `SELECT seccion_id FROM matriculas
                 WHERE alumno_id = $1 AND anio = $2 AND activo = TRUE
                 LIMIT 10`,
                [userId, anioActual],
            );
            if (!enrollments.length) return [];

            const periodoActivo = await this.periodRepo.findOne({ where: { activo: true } });
            if (!periodoActivo) return [];

            const seccionIds = enrollments.map(e => e.seccion_id);
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

        // Admin
        const query = this.courseRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.seccion', 's')
            .leftJoinAndSelect('s.grado', 'g')
            .leftJoinAndSelect('c.periodo', 'p')
            .leftJoinAndSelect('c.docente', 'd')
            .where('c.activo = true');

        if (seccionId) query.andWhere('c.seccion_id = :seccionId', { seccionId });

        return query.orderBy('c.nombre', 'ASC').getMany();
    }

    async findOne(id: string) {
        const course = await this.courseRepo.findOne({
            where: { id, activo: true },
            relations: ['seccion', 'seccion.grado', 'periodo', 'docente'],
        });
        if (!course) throw new NotFoundException(`Curso ${id} no encontrado`);
        return course;
    }

    // ── CRUD ──────────────────────────────────────────────────

    async create(dto: {
        nombre: string;
        descripcion?: string;
        docente_id?: string;
        seccion_id: string;
        periodo_id: string;
        color?: string;
    }) {
        const course = this.courseRepo.create({
            nombre: dto.nombre.trim(),
            descripcion: dto.descripcion ?? null,
            docente_id: dto.docente_id ?? null,
            seccion_id: dto.seccion_id,
            periodo_id: dto.periodo_id,
            color: dto.color ?? '#6B7280',
        });
        return this.courseRepo.save(course);
    }

    async update(
        id: string, docenteId: string, rol: string,
        dto: Partial<{ nombre: string; descripcion: string; activo: boolean }>,
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
        const course = await this.courseRepo.findOne({ where: { id: cursoId, activo: true } });
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
            curso: course.nombre,
            docente: `${docente.nombre} ${docente.apellido_paterno}`,
        };
    }

    // ── Generador desde plantilla CNEB ────────────────────────

    async generateCoursesFromTemplate(seccionId: string, periodoId: string) {
        const [seccion] = await this.dataSource.query(
            `SELECT s.id, s.nombre, g.nombre AS grado, g.orden
               FROM secciones s
               JOIN grados g ON g.id = s.grado_id
              WHERE s.id = $1`,
            [seccionId],
        );
        if (!seccion) throw new NotFoundException(`Sección ${seccionId} no encontrada`);

        const plantilla = CURSOS_POR_GRADO[seccion.orden] ?? Object.values(CURSOS_POR_GRADO)[0];
        const existentes = await this.dataSource.query(
            `SELECT nombre FROM cursos WHERE seccion_id = $1 AND periodo_id = $2`,
            [seccionId, periodoId],
        );
        const nombresExistentes = new Set(existentes.map((c: { nombre: string }) => c.nombre));

        let creados = 0, omitidos = 0;
        for (const nombreCurso of plantilla) {
            if (nombresExistentes.has(nombreCurso)) { omitidos++; continue; }
            await this.dataSource.query(
                `INSERT INTO cursos (nombre, seccion_id, periodo_id, color, activo, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
                [nombreCurso, seccionId, periodoId, COLORES_CURSOS[nombreCurso] ?? '#6B7280'],
            );
            creados++;
        }

        return {
            grado: seccion.grado,
            seccion: seccion.nombre,
            total_plantilla: plantilla.length,
            creados, omitidos,
            mensaje: `${creados} cursos creados, ${omitidos} ya existían`,
        };
    }

    // ── Matrículas ────────────────────────────────────────────

    /**
     * Matricula a un alumno en una sección para un AÑO dado.
     * La matrícula es anual — un alumno solo puede estar en una sección por año.
     * El periodoId recibido es el UUID del periodo activo, del cual extraemos el año.
     */
    async enrollStudent(alumnoId: string, seccionId: string, periodoId: string) {
        // Obtener el año del periodo
        const [periodo] = await this.dataSource.query<{ anio: number }[]>(
            `SELECT anio FROM periodos WHERE id = $1`,
            [periodoId],
        );
        if (!periodo) throw new NotFoundException(`Periodo ${periodoId} no encontrado`);
        const anio = periodo.anio;

        return this.dataSource.transaction(async (manager) => {
            // 1) Desactivar matrículas del alumno en otras secciones del mismo año
            await manager.query(
                `UPDATE matriculas
                 SET activo = FALSE
                 WHERE alumno_id = $1 AND anio = $2 AND seccion_id <> $3 AND activo = TRUE`,
                [alumnoId, anio, seccionId],
            );

            // 2) Buscar matrícula existente en esta sección/año
            const [existing] = await manager.query<{ id: string; activo: boolean }[]>(
                `SELECT id, activo FROM matriculas
                 WHERE alumno_id = $1 AND seccion_id = $2 AND anio = $3`,
                [alumnoId, seccionId, anio],
            );

            if (existing) {
                if (!existing.activo) {
                    await manager.query(
                        `UPDATE matriculas SET activo = TRUE WHERE id = $1`,
                        [existing.id],
                    );
                }
                const [row] = await manager.query(
                    `SELECT * FROM matriculas WHERE id = $1`, [existing.id],
                );
                return row;
            }

            // 3) Crear nueva matrícula
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
        const [enrollment] = await this.dataSource.query<{ id: string; activo: boolean }[]>(
            `SELECT id, activo FROM matriculas WHERE id = $1 AND activo = TRUE`,
            [enrollmentId],
        );
        if (!enrollment) throw new NotFoundException(`Matrícula ${enrollmentId} no encontrada`);

        await this.dataSource.query(
            `UPDATE matriculas SET activo = FALSE WHERE id = $1`,
            [enrollmentId],
        );
        return { message: 'Alumno retirado de la sección' };
    }

    /**
     * Lista los alumnos matriculados activos en una sección (año actual o del periodo activo).
     */
    async getEnrollmentsBySeccion(
        seccionId: string,
        caller?: { id: string; rol: string },
    ) {
        // Verificar que el alumno esté en esta sección si el caller es alumno
        if (caller?.rol === 'alumno') {
            const anioActual = new Date().getFullYear();
            const [matriculado] = await this.dataSource.query(
                `SELECT id FROM matriculas
                 WHERE seccion_id = $1 AND alumno_id = $2 AND anio = $3 AND activo = TRUE`,
                [seccionId, caller.id, anioActual],
            );
            if (!matriculado) {
                throw new ForbiddenException('No estás matriculado en esta sección');
            }
        }

        // Obtener año del periodo activo
        const [periodoActivo] = await this.dataSource.query<{ anio: number }[]>(
            `SELECT anio FROM periodos WHERE activo = TRUE LIMIT 1`,
        );
        const anio = periodoActivo?.anio ?? new Date().getFullYear();

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

        if (caller?.rol === 'alumno') {
            return rows.map((r: any) => ({ ...r, email: null }));
        }

        return rows;
    }
}