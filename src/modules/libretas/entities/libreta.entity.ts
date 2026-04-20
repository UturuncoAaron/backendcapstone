import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Course } from '../../courses/entities/course.entity.js';
import { Period } from '../../academic/entities/period.entity.js';

@Entity('libretas')
export class Libreta {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: User;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ name: 'periodo_id' })
    periodo_id: number;

    @ManyToOne(() => Period, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'periodo_id' })
    periodo: Period;

    /** Bimestre al que corresponde la libreta (1-4) */
    @Column()
    bimestre: number;

    /** Clave del archivo PDF en Cloudflare R2 */
    @Column({ name: 'storage_key', type: 'text' })
    storage_key: string;

    /** Nombre original del archivo PDF */
    @Column({ name: 'nombre_archivo', length: 255, nullable: true })
    nombre_archivo: string | null;

    /** Usuario (docente o admin) que subió la libreta */
    @Column({ name: 'subido_por' })
    subido_por: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'subido_por' })
    subidoPorUsuario: User;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}
