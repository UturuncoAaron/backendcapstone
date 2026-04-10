import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';
import { Question } from './question.entity.js';

@Entity('examenes')
export class Exam {
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

    @Column({ name: 'fecha_inicio', type: 'timestamp' })
    fecha_inicio: Date;

    @Column({ name: 'fecha_fin', type: 'timestamp' })
    fecha_fin: Date;

    @Column({ name: 'puntos_total', default: 20 })
    puntos_total: number;

    @Column({ default: false })
    activo: boolean;

    @OneToMany(() => Question, q => q.examen, { cascade: true })
    preguntas: Question[];

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}