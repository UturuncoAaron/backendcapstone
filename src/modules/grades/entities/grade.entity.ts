import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Course } from '../../courses/entities/course.entity.js';
import { Period } from '../../academic/entities/period.entity.js';

@Entity('notas')
export class Grade {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'alumno_id' })
    alumno_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'alumno_id' })
    alumno: User;

    @Column({ name: 'curso_id' })
    curso_id: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'curso_id' })
    curso: Course;

    @Column({ name: 'periodo_id' })
    periodo_id: number;

    @ManyToOne(() => Period, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'periodo_id' })
    periodo: Period;

    @Column()
    bimestre: number;

    @Column({ name: 'nota_examenes', type: 'decimal', precision: 4, scale: 2, nullable: true })
    nota_examenes: number | null;

    @Column({ name: 'nota_tareas', type: 'decimal', precision: 4, scale: 2, nullable: true })
    nota_tareas: number | null;

    @Column({ name: 'nota_participacion', type: 'decimal', precision: 4, scale: 2, nullable: true })
    nota_participacion: number | null;

    @Column({ name: 'nota_final', type: 'decimal', precision: 4, scale: 2, nullable: true })
    nota_final: number | null;

    // escala es GENERATED en PostgreSQL — no la manejamos desde TypeORM
    @Column({ nullable: true, length: 5, insert: false, update: false })
    escala: string | null;

    @Column({ type: 'text', nullable: true })
    observaciones: string | null;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}