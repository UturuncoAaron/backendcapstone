import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';

/**
 * Configuración por (curso, semana). Solo existe si el docente la creó/editó.
 * Si no existe registro, se asume oculta=false y descripcion=null.
 */
@Entity('semanas_config')
@Index('uq_semanas_config_curso_semana', ['curso_id', 'semana'], { unique: true })
export class SemanaConfig {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    /** Semana 1..N (16 por defecto) dentro del curso */
    @Column({ type: 'int' })
    semana: number;

    /** Bimestre derivado (1..4). Se calcula con Math.ceil(semana / 4). */
    @Column({ type: 'int' })
    bimestre: number;

    /** Si está true, el alumno NO ve la semana ni su contenido. */
    @Column({ default: false })
    oculta: boolean;

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}
