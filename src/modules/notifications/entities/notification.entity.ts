import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('notificaciones')
@Index(['accountId', 'read', 'createdAt'])
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
    cuerpo: string;

    // Referencia polimórfica — apunta al id de la cita, mensaje, libreta, etc.
    @Column({ name: 'referencia_id', nullable: true })
    referenceId: string;

    // Tipo de la referencia — 'cita', 'mensaje', 'libreta', 'tarea', 'comunicado'
    @Column({ name: 'referencia_tipo', length: 40, nullable: true })
    referenceType: string;

    @Column({ name: 'leida', default: false })
    read: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}