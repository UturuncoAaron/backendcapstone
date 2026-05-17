import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Admin } from '../../users/entities/admin.entity.js';

export type Destinatario = 'todos' | 'alumnos' | 'docentes' | 'padres' | 'psicologas';

import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('comunicados')
export class Announcement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'created_by' })
    created_by: string;

    @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'created_by' })
    autor: Cuenta;                          // renombrado de `admin` a `autor`

    @Column({ length: 200 })
    titulo: string;

    @Column({ type: 'text' })
    contenido: string;

    @Column({ type: 'text', array: true, default: '{}' })
    destinatarios: Destinatario[];

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}