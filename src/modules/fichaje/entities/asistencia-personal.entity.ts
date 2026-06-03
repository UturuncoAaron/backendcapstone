import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('asistencias_personal')
export class AsistenciaPersonal {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'cuenta_id', type: 'uuid' })
    cuenta_id: string;

    @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'cuenta_id' })
    cuenta: Cuenta;

    @Column({ type: 'date' })
    fecha: string;

    @Column({ type: 'varchar', length: 12, default: 'presente' })
    estado: 'presente' | 'tardanza' | 'falto' | 'justificado';

    @Column({ name: 'hora_entrada', type: 'time', nullable: true })
    hora_entrada: string | null;

    @Column({ name: 'hora_salida', type: 'time', nullable: true })
    hora_salida: string | null;

    @Column({ name: 'hora_entrada_esperada', type: 'time', nullable: true })
    hora_entrada_esperada: string | null;

    @Column({ name: 'hora_salida_esperada', type: 'time', nullable: true })
    hora_salida_esperada: string | null;

    @Column({ name: 'motivo_justificacion', type: 'varchar', length: 500, nullable: true })
    motivo_justificacion: string | null;

    @Column({ name: 'editado_por', type: 'uuid', nullable: true })
    editado_por: string | null;

    @Column({ name: 'editado_at', type: 'timestamptz', nullable: true })
    editado_at: Date | null;

    @Column({ type: 'text', nullable: true })
    observacion: string | null;

    @Column({ name: 'registrado_por', type: 'uuid' })
    registrado_por: string;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}