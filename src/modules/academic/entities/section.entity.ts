import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { GradeLevel } from './grade-level.entity';

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

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}