import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Psychologist } from './psychologist.entity.js';

@Entity('psicologa_bloqueos')
export class PsychologistBlock {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psychologist, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psychologist;

    @Column({ name: 'fecha_inicio', type: 'timestamp' })
    startDate: Date;

    @Column({ name: 'fecha_fin', type: 'timestamp' })
    endDate: Date;

    @Column({ length: 200, nullable: true })
    motivo: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}