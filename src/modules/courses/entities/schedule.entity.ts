import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Course } from './course.entity.js';

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

@Entity('horarios')
export class Schedule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ name: 'dia_semana', length: 15 })
    dia_semana: DiaSemana;

    @Column({ name: 'hora_inicio', type: 'time' })
    hora_inicio: string;

    @Column({ name: 'hora_fin', type: 'time' })
    hora_fin: string;

    @Column({ nullable: true, length: 50 })
    aula: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}