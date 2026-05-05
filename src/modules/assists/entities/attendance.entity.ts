import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import { Course } from '../../courses/entities/course.entity.js';

@Entity('asistencias')
@Unique('uq_asistencia_alumno_curso_fecha', ['alumno_id', 'curso_id', 'fecha'])
@Index('idx_asistencias_curso_fecha', ['curso_id', 'fecha'])
@Index('idx_asistencias_alumno', ['alumno_id'])
export class Attendance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ── Alumno al que se le registra la asistencia ─────────────
    @Column({ name: 'alumno_id', type: 'uuid' })
    alumno_id: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: Alumno;

    // ── Curso al que pertenece la asistencia (diaria) ──────────
    @Column({ name: 'curso_id', type: 'uuid' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    // ── Fecha de la jornada (sin hora) ─────────────────────────
    @Column({ type: 'date' })
    fecha: string; // 'YYYY-MM-DD'

    @Column({ default: false })
    presente: boolean;

    @Column({ type: 'text', nullable: true })
    justificacion: string | null;

    // ── Docente que tomó la asistencia ─────────────────────────
    @Column({ name: 'registrado_por', type: 'uuid' })
    registrado_por: string;

    @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'registrado_por' })
    registrador: Cuenta;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}