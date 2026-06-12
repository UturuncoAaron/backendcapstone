import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('comunicados')
export class Announcement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'created_by' })
  created_by: string;

  @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  autor: Cuenta;

  @Column({ length: 200 })
  titulo: string;

  @Column({ type: 'text' })
  contenido: string;

  @Column({ type: 'text', array: true, default: '{}' })
  destinatarios: string[];

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'anio', type: 'smallint' })
  anio: number;

  @Column({ default: false })
  importante: boolean;

  @Column({ default: false })
  fijado: boolean;

  @Column({ name: 'fijado_hasta', type: 'timestamptz', nullable: true })
  fijado_hasta: Date | null;

  @Column({ default: 0 })
  vistas: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}