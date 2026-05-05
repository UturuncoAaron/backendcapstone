import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('periodos')
export class Period {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 100 })
    nombre: string;

    @Column({ type: 'smallint' })
    anio: number;

    @Column({ type: 'smallint' })
    bimestre: number;

    @Column({ name: 'fecha_inicio', type: 'date' })
    fecha_inicio: string;

    @Column({ name: 'fecha_fin', type: 'date' })
    fecha_fin: string;

    @Column({ default: false })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}