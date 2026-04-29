import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

@Entity('horarios')
export class Schedule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('uuid')
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ type: 'varchar', length: 15 })
    dia_semana: DiaSemana;

    @Column({ type: 'time' })
    hora_inicio: string;

    @Column({ type: 'time' })
    hora_fin: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    aula: string | null;

    @CreateDateColumn()
    created_at: Date;
}