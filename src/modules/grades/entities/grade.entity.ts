import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Course } from '../../courses/entities/course.entity.js';
import { Period } from '../../academic/entities/period.entity.js';

@Entity('notas')
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
    periodo_id: number;

    @ManyToOne(() => Period, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'periodo_id' })
    periodo: Period;

    @Column({ nullable: true, length: 200 })
    titulo: string | null;

    @Column({
        name: 'nota_examenes',
        type: 'decimal', precision: 4, scale: 2,
        nullable: true,
    })
    nota_examenes: number | null;

    @Column({
        name: 'nota_tareas',
        type: 'decimal', precision: 4, scale: 2,
        nullable: true,
    })
    nota_tareas: number | null;

    @Column({
        name: 'nota_participacion',
        type: 'decimal', precision: 4, scale: 2,
        nullable: true,
    })
    nota_participacion: number | null;

    @Column({
        name: 'nota_final',
        type: 'decimal', precision: 4, scale: 2,
        nullable: true,
    })
    nota_final: number | null;

    @Column({
        nullable: true,
        length: 5,
        generatedType: 'STORED',
        asExpression: `CASE
            WHEN nota_final >= 18 THEN 'AD'
            WHEN nota_final >= 14 THEN 'A'
            WHEN nota_final >= 11 THEN 'B'
            WHEN nota_final IS NOT NULL THEN 'C'
            ELSE NULL
        END`,
    })
    escala: string | null;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}