import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Section } from '../../academic/entities/section.entity.js';
import { Period } from '../../academic/entities/period.entity.js';

@Entity('matriculas')
export class Enrollment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: User;

    @Column({ name: 'seccion_id' })
    seccion_id: number;

    @ManyToOne(() => Section, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'seccion_id' })
    seccion: Section;

    @Column({ name: 'periodo_id' })
    periodo_id: number;

    @ManyToOne(() => Period, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'periodo_id' })
    periodo: Period;

    @Column({ default: true })
    activo: boolean;

    @Column({ name: 'fecha_matricula', type: 'date', default: () => 'CURRENT_DATE' })
    fecha_matricula: Date;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}