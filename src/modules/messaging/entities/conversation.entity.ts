import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';

@Entity('conversaciones')
export class Conversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 20 })
    tipo: string;

    @Column({ name: 'alumno_id', nullable: true })
    studentId: string;

    @ManyToOne(() => Alumno, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'alumno_id' })
    student: Alumno;

    @Column({ length: 20, default: 'activa' })
    estado: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}