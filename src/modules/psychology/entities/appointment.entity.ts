import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import { Padre } from '../../users/entities/padre.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';

@Entity('citas')
export class Appointment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'convocado_por_id' })
    createdById: string;

    @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'convocado_por_id' })
    createdBy: Cuenta;

    @Column({ name: 'padre_id' })
    parentId: string;

    @ManyToOne(() => Padre, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'padre_id' })
    parent: Padre;

    @Column({ name: 'alumno_id' })
    studentId: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    student: Alumno;

    @Column({ length: 20 })
    tipo: string;

    @Column({ length: 20, default: 'presencial' })
    modalidad: string;

    @Column({ type: 'text' })
    motivo: string;

    @Column({ name: 'fecha_hora', type: 'timestamp' })
    scheduledAt: Date;

    @Column({ name: 'duracion_min', type: 'smallint', default: 30 })
    durationMin: number;

    @Column({ length: 20, default: 'pendiente' })
    estado: string;

    @Column({ name: 'notas_previas', type: 'text', nullable: true })
    priorNotes: string;

    @Column({ name: 'notas_posteriores', type: 'text', nullable: true })
    followUpNotes: string;

    @Column({ name: 'reagendada_de', nullable: true })
    rescheduledFromId: string;

    @ManyToOne(() => Appointment, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'reagendada_de' })
    rescheduledFrom: Appointment;

    @Column({ name: 'recordatorio_enviado', default: false })
    reminderSent: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}