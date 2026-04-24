import {
    Entity, PrimaryColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    OneToOne, JoinColumn,
} from 'typeorm';
import { Cuenta } from './cuenta.entity.js';

@Entity('admins')
export class Admin {
    @PrimaryColumn('uuid')
    id: string;

    @OneToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id' })
    cuenta: Cuenta;

    @Column({ length: 100 })
    nombre: string;

    @Column({ name: 'apellido_paterno', length: 100 })
    apellido_paterno: string;

    @Column({ name: 'apellido_materno', length: 100, nullable: true })
    apellido_materno: string | null;

    @Column({ nullable: true, length: 100 })
    cargo: string | null;

    @Column({ nullable: true, unique: true })
    email: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}