import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Psicologa } from '../../users/entities/psicologa.entity.js';

@Entity('psicologa_disponibilidad')
export class PsychologistAvailability {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psicologa, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psicologa;

    @Column({ name: 'dia_semana', length: 15 })
    weekDay: string;

    @Column({ name: 'hora_inicio', type: 'time' })
    startTime: string;

    @Column({ name: 'hora_fin', type: 'time' })
    endTime: string;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}