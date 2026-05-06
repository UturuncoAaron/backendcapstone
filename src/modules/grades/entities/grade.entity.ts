import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Course } from '../../courses/entities/course.entity.js';
import { Period } from '../../academic/entities/period.entity.js';

const decimalToNumber = {
    to: (v: number | null | undefined) => v,
    from: (v: string | null) => (v == null ? null : parseFloat(v)),
};

// El tipo 'examen' fue retirado: hoy solo hay tareas (con o sin alternativas).
// La migración 0001 reescribe filas históricas con tipo='examen' a tipo='tarea'.
export const TIPOS_NOTA = [
    'tarea', 'practica',
    'participacion', 'proyecto', 'otro',
] as const;
export type TipoNota = typeof TIPOS_NOTA[number];

@Entity('notas')
@Unique('notas_uq_alumno_curso_periodo_titulo',
    ['alumno_id', 'curso_id', 'periodo_id', 'titulo'])
@Index('idx_notas_curso_periodo', ['curso_id', 'periodo_id'])
@Index('idx_notas_alumno_periodo', ['alumno_id', 'periodo_id'])
export class Grade {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: Alumno;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ name: 'periodo_id' })
    periodo_id: string;

    @ManyToOne(() => Period, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'periodo_id' })
    periodo: Period;

    @Column({ length: 200 })
    titulo: string;

    @Column({ length: 20 })
    tipo: TipoNota;

    @Column({
        type: 'decimal', precision: 4, scale: 2,
        nullable: true, transformer: decimalToNumber,
    })
    nota: number | null;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @Column({ type: 'date', nullable: true })
    fecha: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}