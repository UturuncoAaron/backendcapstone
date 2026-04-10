import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';

export type TipoMaterial = 'pdf' | 'video' | 'link' | 'grabacion' | 'otro';

@Entity('materiales')
export class Material {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ length: 200 })
    titulo: string;

    @Column({ length: 20 })
    tipo: TipoMaterial;

    @Column({ type: 'text' })
    url: string;

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    @Column({ default: 0 })
    orden: number;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}