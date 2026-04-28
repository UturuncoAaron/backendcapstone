import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn,
    ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Material } from './material.entity.js';

@Entity('material_views')
@Unique('UQ_material_view_alumno_material', ['alumno_id', 'material_id'])
export class MaterialView {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @Column({ name: 'material_id' })
    material_id: string;

    @ManyToOne(() => Material, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'material_id' })
    material: Material;

    @CreateDateColumn({ name: 'fecha' })
    fecha: Date;
}
