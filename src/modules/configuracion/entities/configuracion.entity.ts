import {
    Entity, PrimaryColumn, Column, UpdateDateColumn,
} from 'typeorm';

@Entity('configuracion')
export class Configuracion {
    /** Clave única del parámetro. Ej: 'nombre_colegio' */
    @PrimaryColumn({ length: 100 })
    clave: string;

    @Column({ type: 'text' })
    valor: string;

    @Column({ type: 'text', nullable: true })
    descripcion: string | null;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}