import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Section } from '../../academic/entities/section.entity.js';

@Entity('matriculas')
export class Enrollment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: Alumno;

    @Column({ name: 'seccion_id' })
    seccion_id: string;

    @ManyToOne(() => Section, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'seccion_id' })
    seccion: Section;

    @Column({ type: 'smallint' })
    anio: number;

    @Column({ default: true })
    activo: boolean;

    @Column({ name: 'fecha_matricula', type: 'date', default: () => 'CURRENT_DATE' })
    fecha_matricula: Date;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}