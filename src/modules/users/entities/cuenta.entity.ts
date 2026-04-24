import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type Rol = 'alumno' | 'docente' | 'admin' | 'padre';
export type TipoDocumento = 'dni' | 'ce' | 'pasaporte';

@Entity('cuentas')
export class Cuenta {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tipo_documento', length: 15 })
    tipo_documento: TipoDocumento;

    @Column({ name: 'numero_documento', length: 20 })
    numero_documento: string;

    @Column({ name: 'password_hash' })
    password_hash: string;

    @Column({ length: 20 })
    rol: Rol;

    @Column({ default: true })
    activo: boolean;

    @Column({ name: 'ultimo_acceso', type: 'timestamp', nullable: true })
    ultimo_acceso: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}