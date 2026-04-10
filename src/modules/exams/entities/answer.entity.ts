import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Attempt } from './attempt.entity.js';
import { Question } from './question.entity.js';
import { Option } from './option.entity.js';

@Entity('respuestas_alumno')
export class Answer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'intento_id' })
    intento_id: string;

    @ManyToOne(() => Attempt, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'intento_id' })
    intento: Attempt;

    @Column({ name: 'pregunta_id' })
    pregunta_id: string;

    @ManyToOne(() => Question, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'pregunta_id' })
    pregunta: Question;

    @Column({ name: 'opcion_id', nullable: true })
    opcion_id: string | null;

    @ManyToOne(() => Option, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'opcion_id' })
    opcion: Option | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}