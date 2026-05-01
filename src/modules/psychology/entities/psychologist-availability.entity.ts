import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Psychologist } from './psychologist.entity.js';

@Entity('psicologa_disponibilidad')
export class PsychologistAvailability {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psychologist, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psychologist;

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