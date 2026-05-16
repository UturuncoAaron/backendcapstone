import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn, Unique, Index,
} from 'typeorm';
import { Libreta } from './libreta.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

/**
 * Registra cada vez que un padre/alumno marca como leída una libreta.
 * El admin/docente que sube la libreta puede ver desde aquí si el padre
 * efectivamente abrió el documento. Una fila por (libreta, lector).
 */
@Entity('libretas_lecturas')
@Unique('uq_libretas_lecturas_libreta_lector', ['libreta_id', 'lector_id'])
@Index('idx_libretas_lecturas_libreta', ['libreta_id'])
@Index('idx_libretas_lecturas_lector', ['lector_id'])
export class LibretaLectura {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'libreta_id', type: 'uuid' })
    libreta_id: string;

    @ManyToOne(() => Libreta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'libreta_id' })
    libreta: Libreta;

    @Column({ name: 'lector_id', type: 'uuid' })
    lector_id: string;

    @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'lector_id' })
    lector: Cuenta;

    @CreateDateColumn({ name: 'vista_en' })
    vista_en: Date;
}
