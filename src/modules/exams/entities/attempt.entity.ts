import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Exam } from './exam.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('intentos_examen')
export class Attempt {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'examen_id' })
    examen_id: string;

    @ManyToOne(() => Exam, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'examen_id' })
    examen: Exam;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: User;

    @Column({ default: 1 })
    numero: number;

    @Column({ name: 'fecha_inicio', type: 'timestamp', default: () => 'NOW()' })
    fecha_inicio: Date;

    @Column({ name: 'fecha_fin', type: 'timestamp', nullable: true })
    fecha_fin: Date | null;

    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    puntaje: number | null;

    @Column({ default: false })
    completado: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}