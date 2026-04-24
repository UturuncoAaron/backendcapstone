import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Task } from './task.entity.js';
import { Opcion } from './opcion.entity.js';

@Entity('preguntas')
export class Pregunta {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tarea_id' })
    tarea_id: string;

    @ManyToOne(() => Task, (t) => t.preguntas, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tarea_id' })
    tarea: Task;

    @Column({ type: 'text' })
    enunciado: string;

    @Column({ default: 1 })
    puntos: number;

    @Column({ default: 0 })
    orden: number;

    @OneToMany(() => Opcion, (o) => o.pregunta, { cascade: true })
    opciones: Opcion[];

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}