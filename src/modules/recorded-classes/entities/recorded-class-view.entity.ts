import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { RecordedClass } from './recorded-class.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('grabaciones_vistas')
@Unique('uq_grabacion_vista', ['grabacion_id', 'cuenta_id'])
export class RecordedClassView {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'grabacion_id' })
    grabacion_id: string;

    @ManyToOne(() => RecordedClass, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'grabacion_id' })
    grabacion: RecordedClass;

    @Column({ name: 'cuenta_id' })
    cuenta_id: string;

    @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cuenta_id' })
    cuenta: Cuenta;

    @CreateDateColumn({ name: 'primera_vista_en' })
    primera_vista_en: Date;

    @Column({ name: 'ultima_vista_en', type: 'timestamptz', default: () => 'NOW()' })
    ultima_vista_en: Date;

    @Column({ name: 'veces_vista', default: 1 })
    veces_vista: number;
}