import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';

export type ProveedorGrabacion = 'youtube' | 'drive';

@Entity('clases_grabadas')
export class RecordedClass {
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

    @Column({ length: 10 })
    proveedor: ProveedorGrabacion;

    @Column({ name: 'video_id', type: 'text' })
    video_id: string;

    @Column({ name: 'url_original', type: 'text' })
    url_original: string;

    @Column({ default: false })
    oculto: boolean;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}