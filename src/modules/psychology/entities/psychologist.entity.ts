import {
    Entity, PrimaryColumn, Column,
    OneToOne, JoinColumn,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('psicologas')
export class Psychologist {
    @PrimaryColumn({ type: 'uuid' })
    id: string;

    @OneToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id' })
    account: Cuenta;

    @Column({ length: 100 })
    nombre: string;

    @Column({ name: 'apellido_paterno', length: 100 })
    apellidoPaterno: string;

    @Column({ name: 'apellido_materno', length: 100, nullable: true })
    apellidoMaterno: string;

    @Column({ length: 150, nullable: true })
    especialidad: string;

    @Column({ length: 50, nullable: true })
    colegiatura: string;

    @Column({ name: 'foto_storage_key', nullable: true })
    fotoStorageKey: string;

    @Column({ length: 255, unique: true, nullable: true })
    email: string;

    @Column({ length: 20, nullable: true })
    telefono: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}