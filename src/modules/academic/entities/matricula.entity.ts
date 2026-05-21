import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Section } from './section.entity.js';

@Entity('matriculas')
export class Matricula {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id', type: 'uuid' })
    alumno_id: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: Alumno;

    @Column({ name: 'seccion_id', type: 'uuid' })
    seccion_id: string;

    @ManyToOne(() => Section, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'seccion_id' })
    seccion: Section;

    @Column({ type: 'smallint' })
    anio: number;

    @Column({ default: true })
    activo: boolean;

    @Column({ name: 'condicion_final', type: 'varchar', length: 20, default: 'pendiente' })
    condicion_final: 'pendiente' | 'aprobado' | 'desaprobado' | 'retirado';

    @Column({ name: 'fecha_matricula', type: 'date', default: () => 'CURRENT_DATE' })
    fecha_matricula: string;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}