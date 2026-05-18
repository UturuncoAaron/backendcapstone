import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Unique,
} from 'typeorm';

@Entity('comunicados_lecturas')
@Unique(['comunicado_id', 'cuenta_id'])
export class ComunicadoLectura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'comunicado_id', type: 'uuid' })
  comunicado_id: string;

  @Column({ name: 'cuenta_id', type: 'uuid' })
  cuenta_id: string;

  @CreateDateColumn({ name: 'leido_en' })
  leido_en: Date;
}
