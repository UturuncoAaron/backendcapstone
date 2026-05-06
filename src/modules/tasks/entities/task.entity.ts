import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';
import { Pregunta } from './pregunta.entity.js';

@Entity('tareas')
export class Task {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ length: 200 })
    titulo: string;

    /**
     * Histórico: la columna existía con valores 'tarea' | 'examen' cuando
     * había un módulo de exámenes. Hoy todo es tarea — la columna se mantiene
     * para no romper el schema y forzamos `'tarea'` siempre en código.
     * La migración 0001 convierte los registros 'examen' a 'tarea'.
     */
    @Column({ type: 'varchar', length: 16, default: 'tarea' })
    tipo: 'tarea';

    @Column({ type: 'text', nullable: true })
    instrucciones: string | null;

    // Archivo que sube el docente como enunciado (PDF, imagen, Word en R2)
    @Column({ name: 'enunciado_storage_key', type: 'text', nullable: true })
    enunciado_storage_key: string | null;

    // O un link externo (Drive, YouTube, etc.)
    @Column({ name: 'enunciado_url', type: 'text', nullable: true })
    enunciado_url: string | null;

    @Column({ nullable: true })
    bimestre: number | null;

    @Column({ nullable: true })
    semana: number | null;

    @Column({ name: 'fecha_limite', type: 'timestamp' })
    fecha_limite: Date;

    @Column({ name: 'puntos_max', default: 20 })
    puntos_max: number;

    @Column({ name: 'permite_alternativas', default: false })
    permite_alternativas: boolean;

    @Column({ name: 'permite_archivo', default: false })
    permite_archivo: boolean;

    @Column({ name: 'permite_texto', default: false })
    permite_texto: boolean;

    // FALSE = borrador. El docente activa cuando está lista.
    @Column({ default: false })
    activo: boolean;

    @OneToMany(() => Pregunta, (p) => p.tarea, { cascade: true })
    preguntas: Pregunta[];

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}