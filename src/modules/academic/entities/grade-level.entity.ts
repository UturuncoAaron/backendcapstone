import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, OneToMany,
} from 'typeorm';
import { Section } from './section.entity.js';

@Entity('grados')
export class GradeLevel {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 100, unique: true })
    nombre: string;

    @Column({ type: 'smallint', default: 0 })
    orden: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @OneToMany(() => Section, s => s.grado)
    secciones: Section[];
}