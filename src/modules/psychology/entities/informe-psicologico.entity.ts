import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Psicologa } from '../../users/entities/psicologa.entity.js';
import { Alumno } from '../../users/entities/alumno.entity.js';
import type { InformeTipo, InformeEstado } from '../psychology.types.js';

/**
 * Informe psicológico formal.
 *
 * A diferencia de las fichas (notas internas, eventos), un informe es un
 * documento estructurado que la psicóloga elabora sobre un alumno y que
 * eventualmente puede entregarse en papel/PDF a la familia o a un
 * especialista externo.
 *
 * Flujo:
 *   1. Crear como `borrador` (editable las veces que sea necesario).
 *   2. `finalizar` lo convierte en inmutable y queda `finalizado_at`.
 *   3. El frontend ofrece una vista de impresión amigable que el navegador
 *      puede "Guardar como PDF" sin necesidad de librerías externas.
 */
@Entity('informes_psicologicos')
@Index(['studentId', 'createdAt'])
@Index(['psychologistId', 'createdAt'])
export class InformePsicologico {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'psicologa_id' })
    psychologistId: string;

    @ManyToOne(() => Psicologa, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'psicologa_id' })
    psychologist: Psicologa;

    @Column({ name: 'alumno_id' })
    studentId: string;

    @ManyToOne(() => Alumno, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    student: Alumno;

    @Column({ length: 32 })
    tipo: InformeTipo;

    @Column({ length: 200 })
    titulo: string;

    @Column({ type: 'text' })
    motivo: string;

    @Column({ type: 'text', nullable: true })
    antecedentes: string | null;

    @Column({ type: 'text' })
    observaciones: string;

    @Column({ type: 'text', nullable: true })
    recomendaciones: string | null;

    @Column({ name: 'derivado_a', type: 'text', nullable: true })
    derivadoA: string | null;

    @Column({ length: 16, default: 'borrador' })
    estado: InformeEstado;

    @Column({ name: 'confidencial', default: true })
    confidencial: boolean;

    @Column({ name: 'finalizado_at', type: 'timestamptz', nullable: true })
    finalizadoAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
