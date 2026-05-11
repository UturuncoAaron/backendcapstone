import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import { Padre } from '../../users/entities/padre.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';
import type {
  AppointmentType,
  AppointmentModality,
  AppointmentStatus,
} from '../appointments.types.js';

@Entity('citas')
@Index('idx_citas_convocado', ['createdById', 'estado', 'scheduledAt'])
@Index('idx_citas_convocado_a', ['convocadoAId', 'estado', 'scheduledAt'])
@Index('idx_citas_alumno_fecha', ['studentId', 'scheduledAt'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Quién convoca ────────────────────────────────────────────────
  @Column({ name: 'convocado_por_id' })
  createdById: string;

  @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'convocado_por_id' })
  createdBy: Cuenta;

  // ── A quién convoca (nullable — legacy en BD) ────────────────────
  @Column({ name: 'convocado_a_id', nullable: true })
  convocadoAId: string | null;

  @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'convocado_a_id' })
  convocadoA: Cuenta | null;

  // ── Alumno (NOT NULL en BD) ──────────────────────────────────────
  @Column({ name: 'alumno_id' })
  studentId: string;

  @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alumno_id' })
  student: Alumno;

  // ── Padre (nullable — no siempre es el convocado) ────────────────
  @Column({ name: 'padre_id', nullable: true })
  parentId: string | null;

  @ManyToOne(() => Padre, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'padre_id' })
  parent: Padre | null;

  // ── Datos de la cita ─────────────────────────────────────────────
  @Column({ length: 20 })
  tipo: AppointmentType;

  @Column({ length: 20, default: 'presencial' })
  modalidad: AppointmentModality;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ name: 'fecha_hora', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'duracion_min', type: 'smallint', default: 30 })
  durationMin: number;

  @Column({ length: 20, default: 'pendiente' })
  estado: AppointmentStatus;

  @Column({ name: 'notas_previas', type: 'text', nullable: true })
  priorNotes: string | null;

  @Column({ name: 'notas_posteriores', type: 'text', nullable: true })
  followUpNotes: string | null;

  // ── Reagendamiento ───────────────────────────────────────────────
  @Column({ name: 'reagendada_de', nullable: true })
  rescheduledFromId: string | null;

  @ManyToOne(() => Appointment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reagendada_de' })
  rescheduledFrom: Appointment | null;

  @Column({ name: 'recordatorio_enviado', default: false })
  reminderSent: boolean;

  // ── Auditoría de cancelación ─────────────────────────────────────
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_by_id', nullable: true })
  cancelledById: string | null;

  @ManyToOne(() => Cuenta, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancelled_by_id' })
  cancelledBy: Cuenta | null;

  @Column({ name: 'cancel_reason', length: 500, nullable: true })
  cancelReason: string | null;

  // ── Timestamps ───────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
