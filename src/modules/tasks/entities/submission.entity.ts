import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Task } from './task.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';
import { RespuestaAlternativa } from './respuesta-alternativa.entity.js';

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

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: Alumno;

    // Entrega de archivo (si tarea.permite_archivo)
    @Column({ name: 'storage_key', type: 'text', nullable: true })
    storage_key: string | null;

    @Column({ name: 'nombre_archivo', length: 255, nullable: true })
    nombre_archivo: string | null;

    // Entrega de texto (si tarea.permite_texto)
    @Column({ name: 'respuesta_texto', type: 'text', nullable: true })
    respuesta_texto: string | null;

    // Calculada automáticamente al corregir alternativas
    @Column({ name: 'calificacion_auto', type: 'decimal', precision: 5, scale: 2, nullable: true })
    calificacion_auto: number | null;

    // Puesta manualmente por el docente (archivo/texto)
    @Column({ name: 'calificacion_manual', type: 'decimal', precision: 5, scale: 2, nullable: true })
    calificacion_manual: number | null;

    // Nota final visible al alumno
    @Column({ name: 'calificacion_final', type: 'decimal', precision: 5, scale: 2, nullable: true })
    calificacion_final: number | null;

    @Column({ name: 'comentario_docente', type: 'text', nullable: true })
    comentario_docente: string | null;

    @Column({ name: 'con_retraso', default: false })
    con_retraso: boolean;

    @Column({ name: 'fecha_entrega', type: 'timestamp', default: () => 'NOW()' })
    fecha_entrega: Date;

    @OneToMany(() => RespuestaAlternativa, (r) => r.entrega, { cascade: true })
    respuestas: RespuestaAlternativa[];

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}