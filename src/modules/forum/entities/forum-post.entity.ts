import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Forum } from './forum.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('foro_posts')
export class ForumPost {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'foro_id' })
    foro_id: string;

    @ManyToOne(() => Forum, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'foro_id' })
    foro: Forum;

    @Column({ name: 'cuenta_id' })
    cuenta_id: string;

    @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cuenta_id' })
    cuenta: Cuenta;

    @Column({ type: 'text' })
    contenido: string;

    @Column({ name: 'parent_post_id', nullable: true })
    parent_post_id: string | null;

    @ManyToOne(() => ForumPost, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'parent_post_id' })
    parent_post: ForumPost | null;

    @Column({ default: true })
    activo: boolean;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at: Date;
}