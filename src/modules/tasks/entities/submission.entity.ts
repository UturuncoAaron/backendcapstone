import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Task } from './task.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('entregas_tarea')
export class Submission {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tarea_id' })
    tarea_id: string;

    @ManyToOne(() => Task, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tarea_id' })
    tarea: Task;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: User;

    /** URL pública o link externo */
    @Column({ name: 'url_archivo', type: 'text', nullable: true })
    url_archivo: string | null;

    /** Clave del archivo en Cloudflare R2 si fue subido directamente */
    @Column({ name: 'storage_key', type: 'text', nullable: true })
    storage_key: string | null;

    @Column({ name: 'respuesta_texto', type: 'text', nullable: true })
    respuesta_texto: string | null;

    @Column({ name: 'fecha_entrega', type: 'timestamp', default: () => 'NOW()' })
    fecha_entrega: Date;

    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    calificacion: number | null;

    /** Feedback del docente al calificar */
    @Column({ type: 'text', nullable: true })
    comentario: string | null;

    @Column({ name: 'con_retraso', default: false })
    con_retraso: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}