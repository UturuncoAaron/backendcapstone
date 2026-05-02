import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Psicologa } from '../../users/entities/psicologa.entity.js';

@Entity('psicologa_bloqueos')
export class PsychologistBlock {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psicologa, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psicologa;

    @Column({ name: 'fecha_inicio', type: 'timestamp' })
    startDate: Date;

    @Column({ name: 'fecha_fin', type: 'timestamp' })
    endDate: Date;

    @Column({ length: 200, nullable: true })
    motivo: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}