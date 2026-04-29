import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';
import { Period } from '../../academic/entities/period.entity.js';

export type LibretaTipo = 'alumno' | 'padre';

@Entity('libretas')
export class Libreta {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'cuenta_id' })
    cuenta_id: string;

    @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cuenta_id' })
    cuenta: Cuenta;

    // Discriminador del rol al que pertenece la libreta.
    @Column({ length: 10 })
    tipo: LibretaTipo;

    @Column({ name: 'periodo_id' })
    periodo_id: number;

    @ManyToOne(() => Period, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'periodo_id' })
    periodo: Period;

    // Clave del PDF en Cloudflare R2
    @Column({ name: 'storage_key', type: 'text' })
    storage_key: string;

    @Column({ name: 'nombre_archivo', length: 255, nullable: true })
    nombre_archivo: string | null;

    // Quien subió (admin o docente) — referencia cuentas
    @Column({ name: 'subido_por' })
    subido_por: string;

    @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'subido_por' })
    subidoPor: Cuenta;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}
