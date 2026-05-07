import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { Psicologa } from '../../users/entities/psicologa.entity.js';

@Entity('psicologa_bloqueos')
@Index(['psychologistId', 'startDate', 'endDate'])
export class PsychologistBlock {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psicologa, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psicologa;

    @Column({ name: 'fecha_inicio', type: 'timestamptz' })
    startDate: Date;

    @Column({ name: 'fecha_fin', type: 'timestamptz' })
    endDate: Date;

    @Column({ length: 200, nullable: true })
    motivo: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}