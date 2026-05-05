import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, Index, Unique, Check,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import { Course } from '../../courses/entities/course.entity.js';
import { Period } from '../../academic/entities/period.entity.js'
import type { EstadoAsistencia } from './attendance-general.entity.js';
@Entity('asistencias_curso')
@Unique('uq_asist_curso', ['alumno_id', 'curso_id', 'fecha'])
@Index('idx_asist_curso_curso_fecha', ['curso_id', 'fecha'])
@Index('idx_asist_curso_alumno_periodo', ['alumno_id', 'periodo_id'])
@Index('idx_asist_curso_curso_periodo', ['curso_id', 'periodo_id'])
@Check(`"estado" IN ('asistio','falta','tardanza','justificado')`)
export class AttendanceClass {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id', type: 'uuid' })
    alumno_id: string;
    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: Alumno;

    @Column({ name: 'curso_id', type: 'uuid' })
    curso_id: string;
    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ name: 'periodo_id', type: 'uuid' })
    periodo_id: string;
    @ManyToOne(() => Period, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'periodo_id' })
    periodo: Period;

    @Column({ type: 'date' })
    fecha: string;

    @Column({ type: 'varchar', length: 12 })
    estado: EstadoAsistencia;

    @Column({ type: 'text', nullable: true })
    observacion: string | null;

    @Column({ name: 'registrado_por', type: 'uuid', nullable: true })
    registrado_por: string | null;
    @ManyToOne(() => Cuenta, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'registrado_por' })
    registrador: Cuenta | null;

    @CreateDateColumn({ name: 'created_at' }) created_at: Date;
    @UpdateDateColumn({ name: 'updated_at' }) updated_at: Date;
}