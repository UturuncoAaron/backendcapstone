// users/entities/psicologa.entity.ts
import { Entity, PrimaryColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Cuenta } from './cuenta.entity.js';

@Entity('psicologas')
export class Psicologa {
    @PrimaryColumn({ type: 'uuid' })
    id: string;

    @OneToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id' })
    cuenta: Cuenta;

    @Column({ length: 100 })
    nombre: string;

    @Column({ name: 'apellido_paterno', length: 100 })
    apellido_paterno: string;

    @Column({ name: 'apellido_materno', length: 100, nullable: true })
    apellido_materno: string;

    @Column({ length: 150, nullable: true })
    especialidad: string;

    @Column({ length: 50, nullable: true })
    colegiatura: string;

    @Column({ name: 'foto_storage_key', nullable: true })
    foto_storage_key: string;

    @Column({ length: 255, unique: true, nullable: true })
    email: string;

    @Column({ length: 20, nullable: true })
    telefono: string;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}