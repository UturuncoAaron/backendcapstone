import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Schedule } from '../../courses/entities/schedule.entity.js';
import { Docente } from '../../users/entities/docente.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

export type EstadoDocente = 'presente' | 'tardanza' | 'falto' | 'justificado';

@Entity('asistencias_docente')
@Unique('uq_asist_docente_horario_fecha', ['horario_id', 'fecha'])
export class AttendanceDocente {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'horario_id', type: 'uuid' })
    horario_id: string;

    @ManyToOne(() => Schedule, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'horario_id' })
    horario: Schedule;

    @Column({ name: 'docente_id', type: 'uuid' })
    docente_id: string;

    @ManyToOne(() => Docente, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'docente_id' })
    docente: Docente;

    @Column({ type: 'date' })
    fecha: string;

    @Column({ type: 'varchar', length: 12, default: 'presente' })
    estado: EstadoDocente;

    @Column({ name: 'hora_llegada', type: 'time', nullable: true })
    hora_llegada: string | null;

    @Column({ name: 'motivo_justificacion', type: 'varchar', length: 500, nullable: true })
    motivo_justificacion: string | null;

    @Column({ name: 'hubo_reemplazo', default: false })
    hubo_reemplazo: boolean;

    @Column({ type: 'text', nullable: true })
    observacion: string | null;

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