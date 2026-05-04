import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Grade } from './entities/grade.entity.js';
import { CreateGradeDto } from './dto/create-grade.dto.js';

@Injectable()
export class GradesService {
    constructor(
        @InjectRepository(Grade)
        private readonly gradeRepo: Repository<Grade>,
        private readonly dataSource: DataSource,
    ) { }

    // ══════════════════════════════════════════════════════════════
    // ALUMNO: ver sus propias notas agrupadas por curso y periodo
    // GET /api/grades/my
    // ══════════════════════════════════════════════════════════════
    async getMyGrades(alumnoId: string) {
        return this.dataSource.query(`
            SELECT
                n.id,
                n.alumno_id,
                n.curso_id,
                n.periodo_id,
                n.titulo,
                n.nota_examenes,
                n.nota_tareas,
                n.nota_participacion,
                n.nota_final,
                n.escala,
                n.observaciones,
                c.nombre   AS curso_nombre,
                c.color    AS curso_color,
                p.bimestre AS bimestre,
                p.anio     AS anio,
                p.nombre   AS periodo_nombre
            FROM notas n
            JOIN cursos   c ON c.id = n.curso_id
            JOIN periodos p ON p.id = n.periodo_id
            WHERE n.alumno_id = $1
            ORDER BY p.anio DESC, p.bimestre ASC, c.nombre ASC, n.created_at ASC
        `, [alumnoId]);
    }

    // ══════════════════════════════════════════════════════════════
    // DOCENTE: ver todas las actividades (títulos) de un curso/periodo
    // GET /api/grades/course/:cursoId/actividades?periodoId=1
    // Devuelve los títulos distintos registrados para poder
    // cargar la lista de alumnos por actividad
    // ══════════════════════════════════════════════════════════════
    async getActividadesByCourse(cursoId: string, periodoId?: number) {
        const curso = await this.dataSource.query(
            `SELECT id, seccion_id, periodo_id FROM cursos WHERE id = $1`,
            [cursoId],
        );
        if (!curso.length) throw new NotFoundException(`Curso ${cursoId} no encontrado`);

        const resolvedPeriodoId = periodoId ?? curso[0].periodo_id;

        // Títulos distintos registrados (actividades creadas)
        const actividades = await this.dataSource.query(`
            SELECT DISTINCT
                n.titulo,
                COUNT(n.id)            AS total_alumnos,
                COUNT(n.nota_final)    AS con_nota,
                MIN(n.created_at)      AS created_at
            FROM notas n
            WHERE n.curso_id   = $1
              AND n.periodo_id = $2
              AND n.titulo IS NOT NULL
            GROUP BY n.titulo
            ORDER BY MIN(n.created_at) ASC
        `, [cursoId, resolvedPeriodoId]);

        return { curso_id: cursoId, periodo_id: resolvedPeriodoId, actividades };
    }

    // ══════════════════════════════════════════════════════════════
    // DOCENTE: notas de un curso para una actividad específica
    // GET /api/grades/course/:cursoId?periodoId=1&titulo=Examen Parcial
    // Devuelve todos los alumnos con su nota (o null si no tiene)
    // ══════════════════════════════════════════════════════════════
    async getGradesByCourse(cursoId: string, periodoId?: number, titulo?: string) {
        const curso = await this.dataSource.query(
            `SELECT id, seccion_id, periodo_id FROM cursos WHERE id = $1`,
            [cursoId],
        );
        if (!curso.length) throw new NotFoundException(`Curso ${cursoId} no encontrado`);

        const resolvedPeriodoId = periodoId ?? curso[0].periodo_id;

        // Alumnos matriculados en la sección del curso en ese periodo
        const alumnos = await this.dataSource.query(`
            SELECT DISTINCT ON (a.id)
                a.id               AS alumno_id,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                a.codigo_estudiante
            FROM matriculas m
            JOIN alumnos  a  ON a.id  = m.alumno_id
            JOIN cuentas  ct ON ct.id = a.id AND ct.activo = true
            WHERE m.seccion_id = $1
              AND m.periodo_id = $2
              AND m.activo     = true
            ORDER BY a.id, a.apellido_paterno, a.nombre
        `, [curso[0].seccion_id, resolvedPeriodoId]);

        // Notas existentes filtradas por titulo si viene
        const where: any = { curso_id: cursoId, periodo_id: resolvedPeriodoId };
        if (titulo) {
            where.titulo = titulo;
        } else {
            // Sin titulo = notas finales del bimestre
            where.titulo = null as any;
        }

        const notas = await this.gradeRepo.find({ where });

        return alumnos.map((a: any) => {
            const nota = notas.find(n => n.alumno_id === a.alumno_id);
            return {
                id:                  nota?.id                  ?? null,
                alumno_id:           a.alumno_id,
                alumno: {
                    nombre:           a.nombre,
                    apellido_paterno:  a.apellido_paterno,
                    apellido_materno:  a.apellido_materno,
                    codigo_estudiante: a.codigo_estudiante,
                },
                curso_id:            cursoId,
                periodo_id:          resolvedPeriodoId,
                titulo:              nota?.titulo              ?? titulo ?? null,
                nota_examenes:       nota?.nota_examenes       ?? null,
                nota_tareas:         nota?.nota_tareas         ?? null,
                nota_participacion:  nota?.nota_participacion  ?? null,
                nota_final:          nota?.nota_final          ?? null,
                escala:              nota?.escala              ?? null,
                observaciones:       nota?.observaciones       ?? null,
            };
        });
    }

    // ══════════════════════════════════════════════════════════════
    // DOCENTE: registrar o actualizar nota (upsert)
    // La clave única es alumno + curso + periodo + titulo
    // POST /api/grades
    // ══════════════════════════════════════════════════════════════
    async upsertGrade(dto: CreateGradeDto) {
        const numericFields = [
            'nota_examenes', 'nota_tareas',
            'nota_participacion', 'nota_final',
        ] as const;

        for (const field of numericFields) {
            const val = dto[field];
            if (val !== undefined && val !== null && (val < 0 || val > 20)) {
                throw new BadRequestException(`${field} debe estar entre 0 y 20`);
            }
        }

        // Buscar por la clave correcta según si tiene titulo o no
        const existing = await this.gradeRepo.findOne({
            where: {
                alumno_id:  dto.alumno_id,
                curso_id:   dto.curso_id,
                periodo_id: dto.periodo_id,
                titulo:     dto.titulo ?? null as any,
            },
        });

        if (existing) {
            if (dto.nota_examenes      !== undefined) existing.nota_examenes      = dto.nota_examenes      ?? null;
            if (dto.nota_tareas        !== undefined) existing.nota_tareas        = dto.nota_tareas        ?? null;
            if (dto.nota_participacion !== undefined) existing.nota_participacion = dto.nota_participacion ?? null;
            if (dto.nota_final         !== undefined) existing.nota_final         = dto.nota_final         ?? null;
            if (dto.observaciones      !== undefined) existing.observaciones      = dto.observaciones      ?? null;
            return this.gradeRepo.save(existing);
        }

        return this.gradeRepo.save(this.gradeRepo.create({
            alumno_id:           dto.alumno_id,
            curso_id:            dto.curso_id,
            periodo_id:          dto.periodo_id,
            titulo:              dto.titulo              ?? null,
            nota_examenes:       dto.nota_examenes       ?? null,
            nota_tareas:         dto.nota_tareas         ?? null,
            nota_participacion:  dto.nota_participacion  ?? null,
            nota_final:          dto.nota_final          ?? null,
            observaciones:       dto.observaciones       ?? null,
        }));
    }

    // ══════════════════════════════════════════════════════════════
    // DOCENTE: guardar notas de todo el salón de una vez
    // POST /api/grades/bulk
    // ══════════════════════════════════════════════════════════════
    async upsertBulk(dtos: CreateGradeDto[]) {
        const results = await Promise.allSettled(
            dtos.map(dto => this.upsertGrade(dto)),
        );

        const ok      = results.filter(r => r.status === 'fulfilled').length;
        const errores = results
            .map((r, i) => r.status === 'rejected'
                ? { index: i, alumno_id: dtos[i].alumno_id, error: (r as any).reason?.message }
                : null)
            .filter(Boolean);

        return { guardadas: ok, errores };
    }

    // ══════════════════════════════════════════════════════════════
    // PADRE/ADMIN: todas las notas de un alumno
    // GET /api/grades/alumno/:alumnoId
    // ══════════════════════════════════════════════════════════════
    async getGradesByAlumno(alumnoId: string) {
        return this.dataSource.query(`
            SELECT
                n.id,
                n.alumno_id,
                n.curso_id,
                n.periodo_id,
                n.titulo,
                n.nota_examenes,
                n.nota_tareas,
                n.nota_participacion,
                n.nota_final,
                n.escala,
                n.observaciones,
                c.nombre   AS curso_nombre,
                c.color    AS curso_color,
                p.bimestre AS bimestre,
                p.anio     AS anio,
                p.nombre   AS periodo_nombre
            FROM notas n
            JOIN cursos   c ON c.id = n.curso_id
            JOIN periodos p ON p.id = n.periodo_id
            WHERE n.alumno_id = $1
            ORDER BY p.anio DESC, p.bimestre ASC, c.nombre ASC, n.created_at ASC
        `, [alumnoId]);
    }
}