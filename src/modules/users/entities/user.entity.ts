import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type Rol = 'alumno' | 'docente' | 'admin' | 'padre';
export type TipoDocumento = 'dni' | 'ce' | 'pasaporte';
export type RelacionFamiliar = 'padre' | 'madre' | 'tutor' | 'apoderado';

@Entity('usuarios')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tipo_documento', length: 15 })
    tipo_documento: TipoDocumento;

    @Column({ name: 'numero_documento', length: 20 })
    numero_documento: string;

    @Column({ length: 100 })
    nombre: string;

    @Column({ name: 'apellido_paterno', length: 100 })
    apellido_paterno: string;

    @Column({ name: 'apellido_materno', length: 100, nullable: true })
    apellido_materno: string | null;

    @Column({ name: 'foto_url', type: 'text', nullable: true })
    foto_url: string | null;

    @Column({ name: 'password_hash' })
    password_hash: string;

    @Column({ length: 20 })
    rol: Rol;

    @Column({ default: true })
    activo: boolean;

    @Column({ nullable: true, unique: true })
    email: string | null;

    @Column({ nullable: true, length: 20 })
    telefono: string | null;

    // ── Alumno ──────────────────────────────────
    @Column({ name: 'codigo_estudiante', nullable: true, length: 20, unique: true })
    codigo_estudiante: string | null;

    @Column({ name: 'fecha_nacimiento', nullable: true, type: 'date' })
    fecha_nacimiento: Date | null;

    // ── Docente ──────────────────────────────────
    @Column({ nullable: true, length: 150 })
    especialidad: string | null;

    @Column({ name: 'titulo_profesional', nullable: true, length: 150 })
    titulo_profesional: string | null;

    // ── Padre ──────────────────────────────────
    @Column({ name: 'relacion_familiar', nullable: true, length: 20 })
    relacion_familiar: RelacionFamiliar | null;

    // ── Admin ──────────────────────────────────
    @Column({ nullable: true, length: 100 })
    cargo: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}