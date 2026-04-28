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

    /** URL del recurso externo (YouTube, Drive, etc.). Null si es archivo en R2. */
    @Column({ type: 'text', nullable: true })
    url: string | null;

    /** Clave del archivo en Cloudflare R2. Null si es link externo. */
    @Column({ name: 'storage_key', type: 'text', nullable: true })
    storage_key: string | null;

    /** Nombre original del archivo subido (para forzar descarga con ese nombre). */
    @Column({ name: 'nombre_original', type: 'text', nullable: true })
    nombre_original: string | null;

    @Column({ name: 'mime_type', type: 'text', nullable: true })
    mime_type: string | null;

    @Column({ name: 'size_bytes', type: 'int', nullable: true })
    size_bytes: number | null;

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    /** Bimestre al que pertenece (1-4) */
    @Column({ nullable: true })
    bimestre: number | null;

    /** Semana dentro del bimestre (1-20) */
    @Column({ nullable: true })
    semana: number | null;

    @Column({ default: 0 })
    orden: number;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}