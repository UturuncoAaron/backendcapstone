import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, OneToMany,
} from 'typeorm';
import { Section } from './section.entity';

export type Nivel = 'primaria' | 'secundaria';

@Entity('grados')
export class GradeLevel {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 100, unique: true })
    nombre: string;

    @Column({ length: 20 })
    nivel: Nivel;

    @Column({ default: 0 })
    orden: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @OneToMany(() => Section, s => s.grado)
    secciones: Section[];
}