import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('cuentas')
export class Cuenta {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tipo_documento', length: 15 })
    tipo_documento: string;

    @Column({ name: 'numero_documento', length: 20 })
    numero_documento: string;

    @Column({ name: 'password_hash', length: 255 })
    password_hash: string;

    @Column({ length: 20 })
    rol: string;

    // Código de acceso único por rol — EST-dni, DOC-dni, PAD-dni, ADM-dni, PSI-dni
    @Column({ name: 'codigo_acceso', length: 30, unique: true, nullable: true })
    @Index()
    codigo_acceso: string;

    // false = primer login, debe cambiar password
    @Column({ name: 'password_changed', default: false })
    password_changed: boolean;

    @Column({ default: true })
    activo: boolean;

    @Column({ name: 'ultimo_acceso', nullable: true })
    ultimo_acceso: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}