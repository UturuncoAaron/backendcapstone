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

export const DIAS_SEMANA = [
    'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

@Entity('disponibilidad_cuenta')
@Index('idx_disp_cuenta_activo', ['cuentaId', 'diaSemana'], {
    where: '"activo" = true',
})
export class AccountAvailability {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'cuenta_id' })
    cuentaId: string;

    @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cuenta_id' })
    cuenta: Cuenta;

    @Column({ name: 'dia_semana', length: 15 })
    diaSemana: DiaSemana;

    @Column({ name: 'hora_inicio', type: 'time' })
    horaInicio: string;

    @Column({ name: 'hora_fin', type: 'time' })
    horaFin: string;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}