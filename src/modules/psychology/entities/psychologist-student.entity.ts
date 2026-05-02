import {
    Entity, PrimaryColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Psicologa } from '../../users/entities/psicologa.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';

@Entity('psicologa_alumno')
export class PsychologistStudent {
    @PrimaryColumn({ name: 'psicologa_id', type: 'uuid' })
    psychologistId: string;

    @PrimaryColumn({ name: 'alumno_id', type: 'uuid' })
    studentId: string;

    @ManyToOne(() => Psicologa, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psicologa;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    student: Alumno;

    @Column({ default: true })
    activo: boolean;

    @Column({ type: 'date', default: () => 'CURRENT_DATE' })
    desde: string;

    @Column({ type: 'date', nullable: true })
    hasta: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}