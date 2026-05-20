import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Section } from './section.entity.js';
import { Period } from './period.entity.js';

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

    @Column({ name: 'periodo_id', type: 'uuid', nullable: true })
    periodo_id: string | null;

    @ManyToOne(() => Period, { onDelete: 'RESTRICT', nullable: true })
    @JoinColumn({ name: 'periodo_id' })
    periodo: Period | null;

    @Column({ type: 'int', nullable: true })
    anio: number | null;

    @Column({ default: true })
    activo: boolean;

    /**
     * Condición académica final del alumno en este año/sección. La promueve
     * el admin al cierre del año desde la vista "Año Lectivo". La promoción
     * automática lee este campo para decidir si el alumno avanza, repite o
     * egresa.
     */
    @Column({ name: 'condicion_final', type: 'varchar', length: 20, default: 'pendiente' })
    condicion_final: 'pendiente' | 'aprobado' | 'desaprobado' | 'retirado';

    @Column({ name: 'fecha_matricula', type: 'date', default: () => 'CURRENT_DATE' })
    fecha_matricula: string;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}