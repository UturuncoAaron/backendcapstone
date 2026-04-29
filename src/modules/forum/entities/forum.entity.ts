import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity.js';

@Entity('foros')
export class Forum {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ length: 200 })
    titulo: string;

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    /** Bimestre al que pertenece (1-4). Null = sin clasificar. */
    @Column({ nullable: true })
    bimestre: number | null;

    /** Semana dentro del curso (1-N). Null = sin clasificar. */
    @Column({ nullable: true })
    semana: number | null;

    @Column({ default: true })
    activo: boolean;

    /** Oculto por el docente (visible solo para docente/admin). */
    @Column({ default: false })
    oculto: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}
