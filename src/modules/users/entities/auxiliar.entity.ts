import {
    Entity, PrimaryColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    OneToOne, JoinColumn, Check,
} from 'typeorm';
import { Cuenta } from './cuenta.entity.js';

@Entity('auxiliares')
@Check(`"tipo_contrato" = 'nombrado' OR "fecha_fin_contrato" IS NULL OR "fecha_fin_contrato" > "fecha_inicio_contrato"`)
export class Auxiliar {
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

    @Column({ type: 'varchar', length: 100, default: 'Auxiliar de Educación', nullable: true })
    cargo: string | null;

    @Column({ name: 'foto_storage_key', type: 'text', nullable: true })
    foto_storage_key: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
    email: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    telefono: string | null;

    @Column({ name: 'tipo_contrato', type: 'varchar', length: 20, default: 'contratado' })
    tipo_contrato: 'nombrado' | 'contratado';

    @Column({ name: 'estado_contrato', type: 'varchar', length: 20, default: 'activo' })
    estado_contrato: 'activo' | 'inactivo' | 'pendiente';

    @Column({ name: 'fecha_inicio_contrato', type: 'date', nullable: true })
    fecha_inicio_contrato: Date | null;

    @Column({ name: 'fecha_fin_contrato', type: 'date', nullable: true })
    fecha_fin_contrato: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}
