import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

export type Destinatario = 'todos' | 'alumnos' | 'docentes' | 'padres';

@Entity('comunicados')
export class Announcement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'admin_id' })
    admin_id: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'admin_id' })
    admin: User;

    @Column({ length: 200 })
    titulo: string;

    @Column({ type: 'text' })
    contenido: string;

    @Column({ length: 20, default: 'todos' })
    destinatario: Destinatario;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}