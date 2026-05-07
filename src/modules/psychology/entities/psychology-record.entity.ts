import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Psicologa } from '../../users/entities/psicologa.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';
import type { RecordCategory } from '../psychology.types.js';
@Entity('fichas_psicologia')
@Index(['studentId', 'createdAt'])
export class PsychologyRecord {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psicologa, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psicologa;

    @Column({ name: 'alumno_id' })
    studentId: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    student: Alumno;

    @Column({ length: 30 })
    categoria: RecordCategory;

    @Column({ type: 'text' })
    contenido: string;

    @Column({ name: 'es_privada', default: true })
    isPrivate: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}