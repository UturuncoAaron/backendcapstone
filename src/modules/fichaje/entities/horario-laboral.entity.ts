import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('horarios_laborales')
export class HorarioLaboral {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'cuenta_id', type: 'uuid' })
    cuenta_id: string;

    @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cuenta_id' })
    cuenta: Cuenta;

    @Column({ name: 'dia_semana', type: 'varchar', length: 15 })
    dia_semana: string;

    @Column({ name: 'hora_inicio', type: 'time' })
    hora_inicio: string;

    @Column({ name: 'hora_fin', type: 'time' })
    hora_fin: string;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}