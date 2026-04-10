import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Exam } from './exam.entity.js';
import { Option } from './option.entity.js';

export type TipoPregunta = 'multiple' | 'verdadero_falso';

@Entity('preguntas')
export class Question {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'examen_id' })
    examen_id: string;

    @ManyToOne(() => Exam, e => e.preguntas, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'examen_id' })
    examen: Exam;

    @Column({ type: 'text' })
    enunciado: string;

    @Column({ length: 20 })
    tipo: TipoPregunta;

    @Column({ default: 1 })
    puntos: number;

    @Column({ default: 0 })
    orden: number;

    @OneToMany(() => Option, o => o.pregunta, { cascade: true })
    opciones: Option[];

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}