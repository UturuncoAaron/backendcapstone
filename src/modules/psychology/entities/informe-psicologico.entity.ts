import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Psicologa } from '../../users/entities/psicologa.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';
import type { InformeTipo, InformeEstado } from '../psychology.types.js';

@Entity('informes_psicologicos')
@Index(['studentId', 'createdAt'])
@Index(['psychologistId', 'createdAt'])
export class InformePsicologico {
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

    @Column({ length: 32 })
    tipo: InformeTipo;

    @Column({ length: 200 })
    titulo: string;

    @Column({ type: 'text' })
    motivo: string;

    @Column({ type: 'text', nullable: true })
    antecedentes: string | null;

    @Column({ type: 'text' })
    observaciones: string;

    @Column({ type: 'text', nullable: true })
    recomendaciones: string | null;

    @Column({ name: 'derivado_a', type: 'text', nullable: true })
    derivadoA: string | null;

    @Column({ length: 16, default: 'borrador' })
    estado: InformeEstado;

    @Column({ name: 'confidencial', default: true })
    confidencial: boolean;

    @Column({ name: 'cita_id', type: 'uuid', nullable: true, default: null })
    citaId: string | null;

    @Column({ name: 'finalizado_at', type: 'timestamptz', nullable: true })
    finalizadoAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
