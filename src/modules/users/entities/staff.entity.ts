import {
    Entity, PrimaryColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    OneToOne, JoinColumn,
} from 'typeorm';
import { Cuenta } from './cuenta.entity.js';

@Entity('staff')
export class Staff {
    @PrimaryColumn({ type: 'uuid' })
    id: string;

    @OneToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id' })
    cuenta: Cuenta;

    @Column({ type: 'varchar', length: 100 })
    nombre: string;

    @Column({ name: 'apellido_paterno', type: 'varchar', length: 100 })
    apellido_paterno: string;

    @Column({ name: 'apellido_materno', type: 'varchar', length: 100, nullable: true })
    apellido_materno: string | null;

    @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
    fecha_nacimiento: Date | null;

    @Column({ type: 'varchar', length: 100, default: 'Personal de Apoyo' })
    cargo: string;

    @Column({ name: 'foto_storage_key', type: 'text', nullable: true })
    foto_storage_key: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
    email: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    telefono: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}