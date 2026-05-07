import {
    Injectable, NotFoundException, BadRequestException,
    ForbiddenException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Grade, type TipoNota } from './entities/grade.entity.js';
import { CreateGradeDto } from './dto/create-grade.dto.js';
import { UpdateGradeDto } from './dto/update-grade.dto.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@Injectable()
export class GradesService {
    constructor(
        @InjectRepository(Grade)
        private readonly gradeRepo: Repository<Grade>,
        private readonly dataSource: DataSource,
    ) { }

    // ── Auth helpers ──────────────────────────────────

    /** El docente sólo escribe en cursos suyos. Admin puede todo. */
    private async assertCanWriteCurso(
        cursoId: string,
        user: AuthUser,
        em?: EntityManager,
    ) {
        const runner: EntityManager = em ?? this.dataSource.manager;
        const [curso] = await runner.query(
            `SELECT docente_id FROM cursos WHERE id = $1 AND activo = true`,
            [cursoId],
        );
        if (!curso) throw new NotFoundException('Curso no encontrado');
        if (user.rol !== 'admin' && curso.docente_id !== user.id) {
            throw new ForbiddenException('No eres el docente de este curso');
        }
    }

    /** Padre sólo ve hijos suyos (tabla padre_alumno del schema v7). */
    private async assertPadreOfAlumno(padreId: string, alumnoId: string) {
        const rows = await this.dataSource.query(
            `SELECT 1 FROM padre_alumno
              WHERE padre_id = $1 AND alumno_id = $2 LIMIT 1`,
            [padreId, alumnoId],
        );
        if (rows.length === 0) {
            throw new ForbiddenException('No eres padre/madre de ese alumno');
        }
    }

    // ── CREATE ────────────────────────────────────────

    async create(dto: CreateGradeDto, user: AuthUser): Promise<Grade> {
        await this.assertCanWriteCurso(dto.curso_id, user);

        const exists = await this.gradeRepo.findOne({
            where: {
                alumno_id: dto.alumno_id,
                curso_id: dto.curso_id,
                periodo_id: dto.periodo_id,
                titulo: dto.titulo,
            },
        });
        if (exists) {
            throw new ConflictException(
                `Ya existe nota "${dto.titulo}" para ese alumno; ` +
                `usa PUT/PATCH /grades/${exists.id}`,
            );
        }

        return this.gradeRepo.save(this.gradeRepo.create({
            alumno_id: dto.alumno_id,
            curso_id: dto.curso_id,
            periodo_id: dto.periodo_id,
            titulo: dto.titulo,
            tipo: dto.tipo,
            nota: dto.nota ?? null,
            observaciones: dto.observaciones ?? null,
            fecha: dto.fecha ?? null,
        }));
    }

    // ── PUT ───────────────────────────────────────────

    async replace(id: string, dto: CreateGradeDto, user: AuthUser): Promise<Grade> {
        const existing = await this.gradeRepo.findOne({ where: { id } });
        if (!existing) throw new NotFoundException('Nota no encontrada');
        await this.assertCanWriteCurso(existing.curso_id, user);

        if (
            dto.alumno_id !== existing.alumno_id ||
            dto.curso_id !== existing.curso_id ||
            dto.periodo_id !== existing.periodo_id ||
            dto.titulo !== existing.titulo
        ) {
            throw new BadRequestException(
                'No puedes mover la nota a otro alumno/curso/periodo/titulo. ' +
                'Borra esta y crea una nueva.',
            );
        }

        existing.tipo = dto.tipo;
        existing.nota = dto.nota ?? null;
        existing.observaciones = dto.observaciones ?? null;
        existing.fecha = dto.fecha ?? null;
        return this.gradeRepo.save(existing);
    }

    // ── PATCH ─────────────────────────────────────────

    async update(id: string, dto: UpdateGradeDto, user: AuthUser): Promise<Grade> {
        const existing = await this.gradeRepo.findOne({ where: { id } });
        if (!existing) throw new NotFoundException('Nota no encontrada');
        await this.assertCanWriteCurso(existing.curso_id, user);

        if (dto.titulo !== undefined && dto.titulo !== existing.titulo) {
            const dup = await this.gradeRepo.findOne({
                where: {
                    alumno_id: existing.alumno_id,
                    curso_id: existing.curso_id,
                    periodo_id: existing.periodo_id,
                    titulo: dto.titulo,
                },
            });
            if (dup) {
                throw new ConflictException(
                    `Ya existe nota con titulo "${dto.titulo}" para ese alumno`,
                );
            }
            existing.titulo = dto.titulo;
        }

        if (dto.tipo !== undefined) existing.tipo = dto.tipo;
        if (dto.nota !== undefined) existing.nota = dto.nota ?? null;
        if (dto.observaciones !== undefined) existing.observaciones = dto.observaciones ?? null;
        if (dto.fecha !== undefined) existing.fecha = dto.fecha ?? null;

        return this.gradeRepo.save(existing);
    }

    // ── DELETE ────────────────────────────────────────

    async remove(id: string, user: AuthUser): Promise<void> {
        const existing = await this.gradeRepo.findOne({ where: { id } });
        if (!existing) throw new NotFoundException('Nota no encontrada');
        await this.assertCanWriteCurso(existing.curso_id, user);
        await this.gradeRepo.delete(id);
    }

    // ── GET ONE ───────────────────────────────────────

    async getOneFor(id: string, user: AuthUser): Promise<Grade> {
        const grade = await this.gradeRepo.findOne({ where: { id } });
        if (!grade) throw new NotFoundException('Nota no encontrada');

        if (user.rol === 'alumno' && grade.alumno_id !== user.id) {
            throw new ForbiddenException();
        }
        if (user.rol === 'docente') {
            const [curso] = await this.dataSource.query(
                `SELECT docente_id FROM cursos WHERE id = $1`, [grade.curso_id],
            );
            if (!curso || curso.docente_id !== user.id) {
                throw new ForbiddenException();
            }
        }
        if (user.rol === 'padre') {
            await this.assertPadreOfAlumno(user.id, grade.alumno_id);
        }
        return grade;
    }

    // ── LISTAS ────────────────────────────────────────

    async getGradesByAlumno(alumnoId: string, anio?: number) {
        const params: (string | number)[] = [alumnoId];
        let anioFilter = '';
        if (anio !== undefined) {
            params.push(anio);
            anioFilter = `AND p.anio = $${params.length}`;
        }
        return this.dataSource.query(`
            SELECT
                n.id, n.titulo, n.tipo, n.nota,
                n.observaciones, n.fecha,
                n.curso_id, n.periodo_id,
                c.nombre AS curso_nombre, c.color AS curso_color,
                p.bimestre, p.anio, p.nombre AS periodo_nombre
            FROM notas n
            JOIN cursos   c ON c.id = n.curso_id
            JOIN periodos p ON p.id = n.periodo_id
            WHERE n.alumno_id = $1
            ${anioFilter}
            ORDER BY p.anio DESC, p.bimestre ASC,
                     c.nombre ASC, n.fecha ASC NULLS LAST, n.created_at ASC
        `, params);
    }

    async getGradesByAlumnoForUser(
        alumnoId: string, user: AuthUser, anio?: number,
    ) {
        if (user.rol === 'padre') {
            await this.assertPadreOfAlumno(user.id, alumnoId);
        }
        return this.getGradesByAlumno(alumnoId, anio);
    }

    async getActividadesByCourse(
        cursoId: string, user: AuthUser, periodoId?: number,
    ) {
        const [curso] = await this.dataSource.query(
            `SELECT id, periodo_id, docente_id FROM cursos WHERE id = $1`,
            [cursoId],
        );
        if (!curso) throw new NotFoundException('Curso no encontrado');
        if (user.rol === 'docente' && curso.docente_id !== user.id) {
            throw new ForbiddenException('No eres el docente de este curso');
        }
        const resolvedPeriodoId = periodoId ?? curso.periodo_id;
        const actividades = await this.dataSource.query(`
            SELECT
                titulo, tipo,
                COUNT(*)              AS total_alumnos,
                COUNT(nota)           AS con_nota,
                AVG(nota)::numeric(4,2) AS promedio,
                MIN(fecha)            AS fecha,
                MIN(created_at)       AS created_at
            FROM notas
            WHERE curso_id = $1 AND periodo_id = $2
            GROUP BY titulo, tipo
            ORDER BY MIN(created_at) ASC
        `, [cursoId, resolvedPeriodoId]);
        return { curso_id: cursoId, periodo_id: resolvedPeriodoId, actividades };
    }

    /** Planilla del docente: alumnos × actividades del periodo. */
    async getCourseGrid(cursoId: string, user: AuthUser, periodoId?: number) {
        const [curso] = await this.dataSource.query(
            `SELECT id, seccion_id, periodo_id, docente_id
               FROM cursos WHERE id = $1`,
            [cursoId],
        );
        if (!curso) throw new NotFoundException('Curso no encontrado');
        if (user.rol === 'docente' && curso.docente_id !== user.id) {
            throw new ForbiddenException('No eres el docente de este curso');
        }
        const resolvedPeriodoId = periodoId ?? curso.periodo_id;

        const alumnos = await this.dataSource.query(`
            SELECT a.id AS alumno_id, a.codigo_estudiante,
                   a.nombre, a.apellido_paterno, a.apellido_materno
            FROM matriculas m
            JOIN alumnos a  ON a.id  = m.alumno_id
            JOIN cuentas ct ON ct.id = a.id AND ct.activo = true
            WHERE m.seccion_id = $1
              AND m.periodo_id = $2
              AND m.activo     = true
            ORDER BY a.apellido_paterno, a.apellido_materno NULLS LAST, a.nombre
        `, [curso.seccion_id, resolvedPeriodoId]);

        const notas = await this.gradeRepo
            .createQueryBuilder('n')
            .select(['n.id', 'n.alumno_id', 'n.titulo', 'n.tipo',
                'n.nota', 'n.observaciones', 'n.fecha'])
            .where('n.curso_id = :cursoId', { cursoId })
            .andWhere('n.periodo_id = :periodoId', { periodoId: resolvedPeriodoId })
            .orderBy('n.fecha', 'ASC', 'NULLS LAST')
            .addOrderBy('n.created_at', 'ASC')
            .getMany();

        const actividadesMap = new Map<string, { titulo: string; tipo: TipoNota }>();
        for (const n of notas) {
            if (!actividadesMap.has(n.titulo)) {
                actividadesMap.set(n.titulo, { titulo: n.titulo, tipo: n.tipo });
            }
        }
        const actividades = [...actividadesMap.values()];

        const filas = alumnos.map((a: any) => {
            const notasAlumno = notas.filter((n) => n.alumno_id === a.alumno_id);
            const porActividad: Record<string, any> = {};
            for (const act of actividades) {
                const n = notasAlumno.find((x) => x.titulo === act.titulo);
                porActividad[act.titulo] = n
                    ? { id: n.id, nota: n.nota, observaciones: n.observaciones, fecha: n.fecha }
                    : null;
            }
            return {
                alumno_id: a.alumno_id,
                codigo_estudiante: a.codigo_estudiante,
                alumno: {
                    nombre: a.nombre,
                    apellido_paterno: a.apellido_paterno,
                    apellido_materno: a.apellido_materno,
                },
                notas: porActividad,
                promedio: this.promedio(notasAlumno.map((n) => n.nota)),
            };
        });

        return { curso_id: cursoId, periodo_id: resolvedPeriodoId, actividades, filas };
    }

    private promedio(valores: (number | null)[]): number | null {
        const limpios = valores.filter((v): v is number => v != null);
        if (limpios.length === 0) return null;
        const avg = limpios.reduce((a, b) => a + b, 0) / limpios.length;
        return Math.round(avg * 100) / 100;
    }

    // ── BULK transaccional ────────────────────────────

    async upsertBulk(
        cursoId: string, items: CreateGradeDto[], user: AuthUser,
    ): Promise<{ guardadas: number }> {
        if (items.length === 0) return { guardadas: 0 };

        for (const it of items) {
            if (it.curso_id !== cursoId) {
                throw new BadRequestException(
                    'Todos los items deben pertenecer al curso de la URL',
                );
            }
        }

        const periodoIds = new Set(items.map((i) => i.periodo_id));
        if (periodoIds.size > 1) {
            throw new BadRequestException('El bulk debe ser de un solo periodo');
        }

        return this.dataSource.transaction(async (em) => {
            await this.assertCanWriteCurso(cursoId, user, em);
            const repo = em.getRepository(Grade);
            let guardadas = 0;

            for (const dto of items) {
                let row = await repo.findOne({
                    where: {
                        alumno_id: dto.alumno_id,
                        curso_id: dto.curso_id,
                        periodo_id: dto.periodo_id,
                        titulo: dto.titulo,
                    },
                });
                if (row) {
                    row.tipo = dto.tipo;
                    row.nota = dto.nota ?? null;
                    row.observaciones = dto.observaciones ?? null;
                    row.fecha = dto.fecha ?? null;
                } else {
                    row = repo.create({
                        alumno_id: dto.alumno_id,
                        curso_id: dto.curso_id,
                        periodo_id: dto.periodo_id,
                        titulo: dto.titulo,
                        tipo: dto.tipo,
                        nota: dto.nota ?? null,
                        observaciones: dto.observaciones ?? null,
                        fecha: dto.fecha ?? null,
                    });
                }
                await repo.save(row);
                guardadas++;
            }
            return { guardadas };
        });
    }
}