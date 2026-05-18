import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import { Appointment } from './appointment.entity.js';
import type { AppointmentStatus } from '../appointments.types.js';

/**
 * Historial inmutable de transiciones de estado por cita.
 *
 * El BE escribe una fila cada vez que una cita cambia de estado (al
 * crearla, al aceptarla, al cancelarla, al aplazarla, etc.). El FE lee
 * el historial vía `GET /appointments/:id/estado-log` para mostrar un
 * timeline en el detalle de la cita.
 *
 * Tabla: cita_estado_log
 *   - cita_id            UUID  → citas(id)               ON DELETE CASCADE
 *   - anterior_estado    text  | null (null sólo en la creación inicial)
 *   - nuevo_estado       text  NOT NULL
 *   - changed_by_id      UUID  | null  → cuentas(id)    ON DELETE SET NULL
 *   - changed_at         timestamptz NOT NULL DEFAULT now()
 *   - razon              text  | null  (motivo de cancelar/rechazar/aplazar)
 *
 * La tabla es append-only — los registros nunca se modifican ni se
 * borran (excepto en cascada al borrar la cita).
 */
@Entity('cita_estado_log')
@Index('idx_cita_estado_log_cita', ['appointmentId', 'changedAt'])
export class AppointmentStatusLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cita_id' })
  appointmentId: string;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cita_id' })
  appointment: Appointment;

  /** Estado anterior. `null` cuando es la entrada inicial al crear la cita. */
  @Column({ name: 'anterior_estado', type: 'text', nullable: true })
  previousStatus: AppointmentStatus | null;

  @Column({ name: 'nuevo_estado', type: 'text' })
  nextStatus: AppointmentStatus;

  /** Cuenta que provocó la transición. `null` si la cuenta fue desactivada. */
  @Column({ name: 'changed_by_id', nullable: true })
  changedById: string | null;

  @ManyToOne(() => Cuenta, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'changed_by_id' })
  changedBy: Cuenta | null;

  /** Motivo opcional asociado a la transición (cancelar/rechazar/aplazar). */
  @Column({ name: 'razon', type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
