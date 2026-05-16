import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

export type EstadoDocente = 'presente' | 'tardanza' | 'ausente' | 'permiso' | 'licencia';

@Entity('asistencias_docente')
@Unique(['horario_id', 'fecha'])
export class AttendanceDocente {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'horario_id' })
    horario_id: string;

    @Column({ name: 'docente_id' })
    docente_id: string;

    @Column({ type: 'date' })
    fecha: string;

    @Column({ default: 'presente' })
    estado: EstadoDocente;

    @CreateDateColumn()
    created_at: Date;
}