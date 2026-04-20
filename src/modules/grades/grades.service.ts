import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grade } from './entities/grade.entity.js';
import { CreateGradeDto } from './dto/create-grade.dto.js';

@Injectable()
export class GradesService {
    constructor(
        @InjectRepository(Grade)
        private readonly gradeRepo: Repository<Grade>,
    ) { }

    // GET notas del alumno autenticado
    async getMyGrades(alumnoId: string) {
        return this.gradeRepo.find({
            where: { alumno_id: alumnoId },
            relations: ['curso', 'periodo'],
            order: { bimestre: 'ASC' },
        });
    }

    // GET notas de un curso por bimestre (para docente)
    async getGradesByCourse(cursoId: string, bimestre?: number) {
        // 1. Obtener todos los alumnos matriculados en el curso
        const matriculas = await this.gradeRepo.query(`
        SELECT 
            u.id as alumno_id,
            u.nombre,
            u.apellido_paterno,
            u.apellido_materno
        FROM matriculas m
        JOIN cursos c ON c.seccion_id = m.seccion_id AND c.periodo_id = m.periodo_id
        JOIN usuarios u ON u.id = m.alumno_id
        WHERE c.id = $1 AND m.activo = true
        ORDER BY u.apellido_paterno ASC, u.nombre ASC
    `, [cursoId]);

        // 2. Obtener notas ya registradas
        const where: any = { curso_id: cursoId };
        if (bimestre) where.bimestre = bimestre;

        const notas = await this.gradeRepo.find({ where });

        // 3. Combinar — si no tiene nota, devolver objeto vacío
        return matriculas.map((alumno: any) => {
            const nota = notas.find(n => n.alumno_id === alumno.alumno_id);
            return {
                id: nota?.id ?? null,
                alumno_id: alumno.alumno_id,
                alumno: {
                    nombre: alumno.nombre,
                    apellido_paterno: alumno.apellido_paterno,
                },
                curso_id: cursoId,
                periodo_id: nota?.periodo_id ?? 1,
                bimestre: bimestre ?? 1,
                nota_examenes: nota?.nota_examenes ?? null,
                nota_tareas: nota?.nota_tareas ?? null,
                nota_participacion: nota?.nota_participacion ?? null,
                nota_final: nota?.nota_final ?? null,
                escala: nota?.escala ?? null,
            };
        });
    }

    // POST o PATCH — upsert de nota
    async upsertGrade(dto: CreateGradeDto) {
        const existing = await this.gradeRepo.findOne({
            where: {
                alumno_id: dto.alumno_id,
                curso_id: dto.curso_id,
                periodo_id: dto.periodo_id,
                bimestre: dto.bimestre,
            },
        });

        if (existing) {
            Object.assign(existing, dto);
            return this.gradeRepo.save(existing);
        }

        const grade = this.gradeRepo.create(dto);
        return this.gradeRepo.save(grade);
    }

    // GET notas de un alumno específico (para padre)
    async getGradesByAlumno(alumnoId: string) {
        return this.gradeRepo.find({
            where: { alumno_id: alumnoId },
            relations: ['curso', 'periodo'],
            order: { bimestre: 'ASC' },
        });
    }
}