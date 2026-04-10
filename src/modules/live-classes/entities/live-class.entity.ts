import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';

export type EstadoClase = 'programada' | 'activa' | 'finalizada' | 'cancelada';

@Entity('clases_vivo')
export class LiveClass {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ length: 200 })
    titulo: string;

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    @Column({ name: 'fecha_hora', type: 'timestamp' })
    fecha_hora: Date;

    @Column({ name: 'duracion_min', default: 60 })
    duracion_min: number;

    @Column({ name: 'link_reunion', type: 'text' })
    link_reunion: string;

    @Column({ length: 20, default: 'programada' })
    estado: EstadoClase;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}