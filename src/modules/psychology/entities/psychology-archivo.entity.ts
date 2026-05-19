import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('psychology_archivos')
@Index(['studentId', 'categoria'])
@Index(['studentId', 'confidencial'])
export class PsychologyArchivo {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'psicologa_id', type: 'uuid' })
    psychologistId!: string;

    @Column({ name: 'alumno_id', type: 'uuid' })
    studentId!: string;

    @Column({ type: 'varchar', length: 16 })
    categoria!: 'ficha' | 'test';

    @Column({ type: 'varchar', length: 255 })
    nombre!: string;

    @Column({ type: 'text', nullable: true })
    descripcion!: string | null;

    @Column({ type: 'boolean', default: true })
    confidencial!: boolean;

    @Column({ name: 'storage_key', type: 'varchar', length: 500 })
    storageKey!: string;

    @Column({ name: 'nombre_original', type: 'varchar', length: 255, nullable: true })
    nombreOriginal!: string | null;

    @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
    mimeType!: string | null;

    @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
    sizeBytes!: number | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}