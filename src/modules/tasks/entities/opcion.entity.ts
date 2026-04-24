import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Pregunta } from './pregunta.entity.js';

@Entity('opciones')
export class Opcion {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'pregunta_id' })
    pregunta_id: string;

    @ManyToOne(() => Pregunta, (p) => p.opciones, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'pregunta_id' })
    pregunta: Pregunta;

    @Column({ type: 'text' })
    texto: string;

    // Oculto al alumno hasta que venza fecha_limite (controlado en service)
    @Column({ name: 'es_correcta', default: false })
    es_correcta: boolean;

    @Column({ default: 0 })
    orden: number;
}