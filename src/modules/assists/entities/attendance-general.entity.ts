import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, Index, Unique, Check,
} from 'typeorm';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import { Section } from '../../academic/entities/section.entity.js';
import { Period } from '../../academic/entities/period.entity.js';

export type EstadoAsistencia = 'asistio' | 'falta' | 'tardanza' | 'justificado';
export const ESTADOS_ASISTENCIA: EstadoAsistencia[] = [
    'asistio', 'falta', 'tardanza', 'justificado',
];

/** Asistencia GENERAL del día (tutor de la sección). 1 fila por alumno por día. */
@Entity('asistencias_generales')
@Unique('uq_asist_general', ['alumno_id', 'seccion_id', 'fecha'])
@Index('idx_asist_gen_seccion_fecha', ['seccion_id', 'fecha'])
@Index('idx_asist_gen_alumno_periodo', ['alumno_id', 'periodo_id'])
@Check(`"estado" IN ('asistio','falta','tardanza','justificado')`)
export class AttendanceGeneral {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id', type: 'uuid' })
    alumno_id: string;
    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: Alumno;

    @Column({ name: 'seccion_id', type: 'uuid' })   // ← ESTA LÍNEA TE FALTABA
    seccion_id: string;
    @ManyToOne(() => Section, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'seccion_id' })
    seccion: Section;

    @Column({ name: 'periodo_id', type: 'uuid' })   // ← ESTA TAMBIÉN
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