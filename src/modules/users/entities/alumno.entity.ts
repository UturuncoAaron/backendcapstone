import {
    Entity, PrimaryColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    OneToOne, JoinColumn,
} from 'typeorm';
import { Cuenta } from './cuenta.entity.js';

@Entity('alumnos')
export class Alumno {
    @PrimaryColumn('uuid')
    id: string;

    @OneToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id' })
    cuenta: Cuenta;

    @Column({ name: 'codigo_estudiante', length: 20, unique: true })
    codigo_estudiante: string;

    @Column({ length: 100 })
    nombre: string;

    @Column({ name: 'apellido_paterno', length: 100 })
    apellido_paterno: string;

    @Column({ name: 'apellido_materno', length: 100, nullable: true })
    apellido_materno: string | null;

    @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
    fecha_nacimiento: Date | null;

    @Column({ name: 'foto_storage_key', type: 'text', nullable: true })
    foto_storage_key: string | null;

    @Column({ nullable: true, unique: true })
    email: string | null;

    @Column({ nullable: true, length: 20 })
    telefono: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}