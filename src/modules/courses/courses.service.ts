import {
    Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
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
        @InjectDataSource() private readonly dataSource: DataSource,
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
        docente_id?: string;
        seccion_id: number;
        periodo_id: number;
        color?: string;
    }) {
        const course = this.courseRepo.create(dto as any);
        return this.courseRepo.save(course);
    }

    async update(id: string, docenteId: string, rol: string, dto: Partial<{
        nombre: string;
        descripcion: string;
    }>) {
        const course = await this.courseRepo.findOne({ where: { id, activo: true } });
        if (!course) throw new NotFoundException(`Curso ${id} no encontrado`);

        if (rol === 'docente' && course.docente_id !== docenteId) {
            throw new ForbiddenException('No tienes permiso para editar este curso');
        }

        Object.assign(course, dto);
        return this.courseRepo.save(course);
    }

    // ── ASIGNAR DOCENTE ─────────────────────────────────────────────

    async assignTeacher(cursoId: string, docenteId: string) {
        const curso = await this.courseRepo.findOne({ where: { id: cursoId, activo: true } });
        if (!curso) throw new NotFoundException(`Curso ${cursoId} no encontrado`);

        const docente = await this.dataSource.query(
            `SELECT id, nombre, apellido_paterno
             FROM usuarios
             WHERE id = $1 AND rol = 'docente' AND activo = true`,
            [docenteId],
        );
        if (!docente.length) throw new NotFoundException(`Docente ${docenteId} no encontrado`);

        curso.docente_id = docenteId;
        await this.courseRepo.save(curso);

        return {
            curso: curso.nombre,
            docente: `${docente[0].nombre} ${docente[0].apellido_paterno}`,
        };
    }

    // ── GENERAR CURSOS DESDE PLANTILLA ──────────────────────────────

    async generateCoursesFromTemplate(seccionId: number, periodoId: number) {
        // Obtener sección con su grado
        const seccion = await this.dataSource.query(
            `SELECT s.id, s.nombre, g.id AS grado_id, g.nombre AS grado, g.orden
             FROM secciones s
             JOIN grados g ON g.id = s.grado_id
             WHERE s.id = $1`,
            [seccionId],
        );
        if (!seccion.length) throw new NotFoundException(`Sección ${seccionId} no encontrada`);

        const { orden: gradoOrden, grado_id: gradoId, grado, nombre: seccionNombre } = seccion[0];

        // Buscar plantilla por orden primero, si no existe buscar por grado_id
        // Esto cubre casos donde el orden en BD no coincide con las claves del template
        let plantilla = CURSOS_POR_GRADO[gradoOrden];

        // Si no encontró por orden, usar la plantilla genérica de secundaria
        // ya que todos los grados de secundaria tienen los mismos cursos
        if (!plantilla) {
            // Todos los grados de secundaria tienen los mismos 11 cursos
            plantilla = [
                'Matemática',
                'Comunicación',
                'Inglés',
                'Historia, Geografía y Economía',
                'Formación Ciudadana y Cívica',
                'Persona, Familia y Relaciones Humanas',
                'Ciencia, Tecnología y Ambiente',
                'Educación para el Trabajo',
                'Educación Física',
                'Arte y Cultura',
                'Educación Religiosa',
            ];
        }

        // Cursos ya existentes en esta sección+periodo
        const existentes = await this.dataSource.query(
            `SELECT nombre FROM cursos WHERE seccion_id = $1 AND periodo_id = $2`,
            [seccionId, periodoId],
        );
        const nombresExistentes = new Set(existentes.map((c: any) => c.nombre));

        let creados = 0;
        let omitidos = 0;

        for (const nombreCurso of plantilla) {
            if (nombresExistentes.has(nombreCurso)) {
                omitidos++;
                continue;
            }

            const color = COLORES_CURSOS[nombreCurso] ?? '#6B7280';

            await this.dataSource.query(
                `INSERT INTO cursos (nombre, seccion_id, periodo_id, color, activo, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
                [nombreCurso, seccionId, periodoId, color],
            );
            creados++;
        }

        return {
            grado,
            seccion: seccionNombre,
            total_plantilla: plantilla.length,
            creados,
            omitidos,
            mensaje: `${creados} cursos creados, ${omitidos} ya existían`,
        };
    }

    // ── MATRICULAS ──────────────────────────────────────────────────

    async enrollStudent(alumnoId: string, seccionId: number, periodoId: number) {
        const existing = await this.enrollmentRepo.findOne({
            where: { alumno_id: alumnoId, seccion_id: seccionId, periodo_id: periodoId },
        });

        if (existing) {
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