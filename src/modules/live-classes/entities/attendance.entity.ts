import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { LiveClass } from './live-class.entity.js';
// Importamos las nuevas entidades separadas
import { Alumno } from '../../users/entities/alumno.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('asistencias')
export class Attendance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    // Actualizado de User a Alumno
    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: Alumno;

    @Column({ name: 'clase_vivo_id' })
    clase_vivo_id: string;

    @ManyToOne(() => LiveClass, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'clase_vivo_id' })
    clase_vivo: LiveClass;

    @Column({ default: false })
    presente: boolean;

    @Column({ type: 'text', nullable: true })
    justificacion: string | null;

    @Column({ name: 'registrado_por', nullable: true })
    registrado_por: string | null;

    // Actualizado de User a Cuenta (ya que un admin o docente usa su cuenta para registrar)
    @ManyToOne(() => Cuenta, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'registrado_por' })
    registrador: Cuenta | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}