import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('periodos')
export class Period {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 100 })
    nombre: string;

    @Column()
    anio: number;

    @Column()
    bimestre: number;

    @Column({ type: 'date', name: 'fecha_inicio' })
    fecha_inicio: Date;

    @Column({ type: 'date', name: 'fecha_fin' })
    fecha_fin: Date;

    @Column({ default: false })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}