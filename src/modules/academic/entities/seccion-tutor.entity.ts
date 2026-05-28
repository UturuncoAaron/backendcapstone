import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Section } from './section.entity.js';
import { Docente } from '../../users/entities/docente.entity.js';

@Entity('secciones_tutores')
export class SeccionTutor {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'seccion_id', type: 'uuid' })
    seccion_id: string;

    @ManyToOne(() => Section, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'seccion_id' })
    seccion: Section;

    @Column({ name: 'docente_id', type: 'uuid' })
    docente_id: string;

    @ManyToOne(() => Docente, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'docente_id' })
    docente: Docente;

    @Column({ type: 'smallint' })
    anio: number;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}