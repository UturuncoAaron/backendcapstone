import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn,
    UpdateDateColumn, Unique, Index,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('permisos_extra')
@Unique(['cuentaId', 'modulo', 'accion'])
@Index(['cuentaId', 'modulo', 'accion'], { where: '"activo" = TRUE' })
export class PermisoExtra {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'cuenta_id' })
    cuentaId: string;

    @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cuenta_id' })
    cuenta: Cuenta;

    @Column({ length: 50 })
    modulo: string;

    @Column({ length: 50 })
    accion: string;

    @Column({ name: 'otorgado_por' })
    otorgadoPorId: string;

    @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'otorgado_por' })
    otorgadoPor: Cuenta;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}