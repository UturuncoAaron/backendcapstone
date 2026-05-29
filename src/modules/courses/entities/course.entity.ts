import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Docente } from '../../users/entities/docente.entity.js';
import { Section } from '../../academic/entities/section.entity.js';
import { CourseCatalog } from './course-catalog.entity.js';

@Entity('cursos')
export class Course {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    @Column({ name: 'catalogo_id' })
    catalogo_id: string;

    @ManyToOne(() => CourseCatalog, { onDelete: 'RESTRICT', eager: false })
    @JoinColumn({ name: 'catalogo_id' })
    catalogo: CourseCatalog;

    @Column({ name: 'docente_id', nullable: true })
    docente_id: string | null;

    @ManyToOne(() => Docente, { onDelete: 'RESTRICT', nullable: true })
    @JoinColumn({ name: 'docente_id' })
    docente: Docente | null;

    @Column({ name: 'seccion_id' })
    seccion_id: string;

    @ManyToOne(() => Section, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'seccion_id' })
    seccion: Section;

    @Column({ type: 'smallint' })
    anio: number;

    @Column({ length: 7, default: '#1976d2' })
    color: string;

    @Column({ default: true })
    activo: boolean;

    get nombre(): string {
        return this.catalogo?.nombre ?? '';
    }

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}