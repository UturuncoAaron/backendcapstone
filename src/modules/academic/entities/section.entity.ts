import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { GradeLevel } from './grade-level.entity.js';

@Entity('secciones')
export class Section {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'grado_id' })
    grado_id: number;

    @ManyToOne(() => GradeLevel, g => g.secciones, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'grado_id' })
    grado: GradeLevel;

    @Column({ length: 10 })
    nombre: string;

    @Column({ default: 35 })
    capacidad: number;

    /** Docente tutor asignado a la sección */
    @Column({ name: 'tutor_id', nullable: true })
    tutor_id: string | null;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}