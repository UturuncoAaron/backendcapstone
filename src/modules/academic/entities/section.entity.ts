import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { GradeLevel } from './grade-level.entity.js';

@Entity('secciones')
export class Section {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'grado_id', type: 'uuid' })
    grado_id: string;

    @ManyToOne(() => GradeLevel, (g) => g.secciones, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'grado_id' })
    grado: GradeLevel;

    @Column({ length: 10 })
    nombre: string;

    @Column({ type: 'smallint', default: 35 })
    capacidad: number;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}