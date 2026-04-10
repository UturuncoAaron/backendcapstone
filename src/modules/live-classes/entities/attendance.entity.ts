import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { LiveClass } from './live-class.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('asistencias')
export class Attendance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: User;

    @Column({ name: 'clase_vivo_id' })
    clase_vivo_id: string;

    @ManyToOne(() => LiveClass, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'clase_vivo_id' })
    clase_vivo: LiveClass;

    @Column({ default: false })
    presente: boolean;

    @Column({ type: 'text', nullable: true })
    justificacion: string | null;

    @Column({ name: 'registrado_por', nullable: true })
    registrado_por: string | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'registrado_por' })
    registrador: User | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}