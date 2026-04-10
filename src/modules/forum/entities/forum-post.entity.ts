import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Forum } from './forum.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('foro_posts')
export class ForumPost {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'foro_id' })
    foro_id: string;

    @ManyToOne(() => Forum, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'foro_id' })
    foro: Forum;

    @Column({ name: 'usuario_id' })
    usuario_id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'usuario_id' })
    usuario: User;

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