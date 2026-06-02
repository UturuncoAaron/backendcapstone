import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Psicologa } from '../../users/entities/psicologa.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';
import type { InformeEstado } from '../psychology.types.js';

@Entity('informes_psicologicos')
@Index(['studentId', 'createdAt'])
@Index(['psychologistId', 'createdAt'])
export class InformePsicologico {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psicologa, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psicologa;

    @Column({ name: 'alumno_id' })
    studentId: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    student: Alumno;

    // ── Datos de filiación ──────────────────────────────────────

    @Column({ name: 'edad_evaluacion', type: 'smallint', nullable: true })
    edadEvaluacion: number | null;

    @Column({ name: 'motivo_consulta_corto', type: 'text', nullable: true })
    motivoConsultaCorto: string | null;

    @Column({ name: 'referente', length: 200, nullable: true })
    referente: string | null;

    @Column({ name: 'fecha_evaluacion_inicio', type: 'date', nullable: true })
    fechaEvaluacionInicio: string | null;

    @Column({ name: 'fecha_evaluacion_fin', type: 'date', nullable: true })
    fechaEvaluacionFin: string | null;

    @Column({ name: 'fecha_informe', type: 'date', nullable: true })
    fechaInforme: string | null;

    @Column({ name: 'tecnicas_utilizadas', type: 'text', nullable: true })
    tecnicasUtilizadas: string | null;

    @Column({ name: 'instrumentos_utilizados', type: 'text', nullable: true })
    instrumentosUtilizados: string | null;

    // ── Cuerpo del informe ──────────────────────────────────────

    @Column({ name: 'motivo_consulta', type: 'text', nullable: true })
    motivoConsulta: string | null;

    @Column({ name: 'antecedentes_familia', type: 'text', nullable: true })
    antecedentesFamilia: string | null;

    @Column({ name: 'antecedentes_academico', type: 'text', nullable: true })
    antecedentesAcademico: string | null;

    @Column({ name: 'antecedentes_escolar', type: 'text', nullable: true })
    antecedentesEscolar: string | null;

    @Column({ name: 'antecedentes_autopercepcion', type: 'text', nullable: true })
    antecedentesAutopercepcion: string | null;

    @Column({ name: 'observaciones_conducta', type: 'text', nullable: true })
    observacionesConducta: string | null;

    @Column({ name: 'resultados_cognitiva', type: 'text', nullable: true })
    resultadosCognitiva: string | null;

    @Column({ name: 'resultados_emocional', type: 'text', nullable: true })
    resultadosEmocional: string | null;

    @Column({ name: 'resultados_conductual', type: 'text', nullable: true })
    resultadosConductual: string | null;

    @Column({ name: 'resultados_social', type: 'text', nullable: true })
    resultadosSocial: string | null;

    @Column({ name: 'analisis_resultados', type: 'text', nullable: true })
    analisisResultados: string | null;

    @Column({ name: 'conclusiones', type: 'text', nullable: true })
    conclusiones: string | null;

    @Column({ name: 'recomendaciones_institucion', type: 'text', nullable: true })
    recomendacionesInstitucion: string | null;

    @Column({ name: 'recomendaciones_familia', type: 'text', nullable: true })
    recomendacionesFamilia: string | null;

    // ── Control ─────────────────────────────────────────────────

    @Column({ length: 16, default: 'borrador' })
    estado: InformeEstado;

    @Column({ name: 'confidencial', default: true })
    confidencial: boolean;

    @Column({ name: 'cita_id', type: 'uuid', nullable: true, default: null })
    citaId: string | null;

    @Column({ name: 'finalizado_at', type: 'timestamptz', nullable: true })
    finalizadoAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}