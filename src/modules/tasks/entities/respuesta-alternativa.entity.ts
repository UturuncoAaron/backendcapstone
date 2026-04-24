import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
    Unique,
} from 'typeorm';
import { Submission } from './submission.entity.js';
import { Pregunta } from './pregunta.entity.js';
import { Opcion } from './opcion.entity.js';

@Entity('respuestas_alternativas')
@Unique(['entrega_id', 'pregunta_id'])
export class RespuestaAlternativa {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'entrega_id' })
    entrega_id: string;

    @ManyToOne(() => Submission, (s) => s.respuestas, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'entrega_id' })
    entrega: Submission;

    @Column({ name: 'pregunta_id' })
    pregunta_id: string;

    @ManyToOne(() => Pregunta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'pregunta_id' })
    pregunta: Pregunta;

    @Column({ name: 'opcion_id' })
    opcion_id: string;

    @ManyToOne(() => Opcion, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'opcion_id' })
    opcion: Opcion;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}