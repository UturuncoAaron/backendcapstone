import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Question } from './question.entity.js';

@Entity('opciones')
export class Option {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'pregunta_id' })
    pregunta_id: string;

    @ManyToOne(() => Question, q => q.opciones, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'pregunta_id' })
    pregunta: Question;

    @Column({ type: 'text' })
    texto: string;

    @Column({ name: 'es_correcta', default: false })
    es_correcta: boolean;

    @Column({ default: 0 })
    orden: number;
}