import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

/**
 * Notificación persistida (la fuente de verdad). El push por SSE se hace en
 * paralelo desde el gateway — si el usuario no estaba conectado, la verá
 * cuando abra la app y haga `GET /notifications`.
 *
 * `expiresAt` se setea automáticamente a `createdAt + 14 días` (ver el
 * trigger SQL en `notifications.schema-sync`) y un job diario borra todas
 * las notificaciones cuyo `expiresAt` ya pasó. De esta forma:
 *  - El campanito nunca se llena.
 *  - La tabla se mantiene chica (1-2 semanas de tráfico).
 *  - El cliente puede confiar en que cualquier listado es relevante.
 */
@Entity('notificaciones')
@Index('idx_notif_cuenta_leida', ['accountId', 'read', 'createdAt'])
@Index('idx_notif_expires', ['expiresAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cuenta_id' })
  accountId: string;

  @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cuenta_id' })
  account: Cuenta;

  @Column({ length: 40 })
  tipo: string;

  @Column({ length: 200 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  cuerpo: string | null;

  // Referencia polimórfica — apunta al id de la cita, mensaje, libreta, etc.
  @Column({ name: 'referencia_id', nullable: true })
  referenceId: string | null;

  // Tipo de la referencia — 'cita', 'mensaje', 'libreta', 'tarea', 'comunicado'
  @Column({ name: 'referencia_tipo', length: 40, nullable: true })
  referenceType: string | null;

  @Column({ name: 'leida', default: false })
  read: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
}
