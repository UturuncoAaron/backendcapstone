import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Psychologist } from './psychologist.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';

@Entity('fichas_psicologia')
export class PsychologyRecord {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psychologist, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psychologist;

    @Column({ name: 'alumno_id' })
    studentId: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    student: Alumno;

    @Column({ length: 30 })
    categoria: string;

    @Column({ type: 'text' })
    contenido: string;

    @Column({ name: 'es_privada', default: true })
    isPrivate: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}