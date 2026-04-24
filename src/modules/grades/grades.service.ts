import { Injectable } from '@nestjs/common';
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

    // Alumno ve sus propias notas (bimestre viene del JOIN con periodos)
    async getMyGrades(alumnoId: string) {
        return this.gradeRepo.find({
            where: { alumno_id: alumnoId },
            relations: ['curso', 'periodo'],
            order: { periodo: { anio: 'DESC', bimestre: 'ASC' } },
        });
    }

    // Docente ve notas de su curso — incluye alumnos sin nota aún
    async getGradesByCourse(cursoId: string, periodoId?: number) {
        // Alumnos matriculados en la sección del curso
        const alumnos = await this.dataSource.query(`
            SELECT
                a.id          AS alumno_id,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                a.codigo_estudiante
            FROM matriculas m
            JOIN cursos  c ON c.seccion_id = m.seccion_id
                          AND c.periodo_id = m.periodo_id
            JOIN alumnos a ON a.id = m.alumno_id
            JOIN cuentas ct ON ct.id = a.id AND ct.activo = true
            WHERE c.id = $1 AND m.activo = true
            ORDER BY a.apellido_paterno, a.nombre
        `, [cursoId]);

        // Notas ya registradas para ese curso y periodo
        const where: any = { curso_id: cursoId };
        if (periodoId) where.periodo_id = periodoId;

        const notas = await this.gradeRepo.find({
            where,
            relations: ['periodo'],
        });

        // Combinar: si el alumno no tiene nota aún, devolver campos en null
        return alumnos.map((a: any) => {
            const nota = notas.find((n) => n.alumno_id === a.alumno_id);
            return {
                id: nota?.id ?? null,
                alumno_id: a.alumno_id,
                alumno: {
                    nombre: a.nombre,
                    apellido_paterno: a.apellido_paterno,
                    apellido_materno: a.apellido_materno,
                    codigo_estudiante: a.codigo_estudiante,
                },
                curso_id: cursoId,
                periodo_id: nota?.periodo_id ?? periodoId ?? null,
                bimestre: nota?.periodo?.bimestre ?? null,
                nota_tareas: nota?.nota_tareas ?? null,
                nota_participacion: nota?.nota_participacion ?? null,
                nota_final: nota?.nota_final ?? null,
                escala: nota?.escala ?? null,
                observaciones: nota?.observaciones ?? null,
            };
        });
    }

    // Docente registra o actualiza nota (upsert por alumno+curso+periodo)
    async upsertGrade(dto: CreateGradeDto) {
        const existing = await this.gradeRepo.findOne({
            where: {
                alumno_id: dto.alumno_id,
                curso_id: dto.curso_id,
                periodo_id: dto.periodo_id,
            },
        });

        if (existing) {
            Object.assign(existing, dto);
            return this.gradeRepo.save(existing);
        }

        return this.gradeRepo.save(this.gradeRepo.create(dto));
    }

    // Padre o admin ve todas las notas de un alumno
    async getGradesByAlumno(alumnoId: string) {
        return this.gradeRepo.find({
            where: { alumno_id: alumnoId },
            relations: ['curso', 'periodo'],
            order: { periodo: { anio: 'DESC', bimestre: 'ASC' } },
        });
    }
}