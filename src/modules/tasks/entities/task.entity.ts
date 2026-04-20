import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';

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

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    /** Bimestre al que pertenece (1-4) */
    @Column({ nullable: true })
    bimestre: number | null;

    /** Semana dentro del bimestre (1-20) */
    @Column({ nullable: true })
    semana: number | null;

    @Column({ name: 'fecha_entrega', type: 'timestamp' })
    fecha_entrega: Date;

    @Column({ name: 'puntos_max', default: 20 })
    puntos_max: number;

    /** El alumno puede subir un archivo como entrega */
    @Column({ name: 'permite_archivo', default: true })
    permite_archivo: boolean;

    /** El alumno puede escribir respuesta en texto */
    @Column({ name: 'permite_texto', default: true })
    permite_texto: boolean;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}