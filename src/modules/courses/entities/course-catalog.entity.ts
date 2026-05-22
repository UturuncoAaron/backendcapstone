import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('cursos_catalogo')
export class CourseCatalog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 150, unique: true })
    nombre: string;

    @Column({ length: 100, nullable: true })
    area: string | null;

    @Column({ length: 7, default: '#1976d2' })
    color: string;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}