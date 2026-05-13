import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

export type AttachmentOwnerType = 'forum_post' | 'message' | 'announcement';

export const ATTACHMENT_OWNER_TYPES: ReadonlyArray<AttachmentOwnerType> = [
    'forum_post', 'message', 'announcement',
] as const;

/** Adjunto polimórfico reusado por foros, mensajes y comunicados. */
@Entity('attachments')
@Index('idx_attachments_owner', ['owner_type', 'owner_id'])
@Index('idx_attachments_uploaded_by', ['uploaded_by'])
export class Attachment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'owner_type', length: 30 })
    owner_type: AttachmentOwnerType;

    @Column({ name: 'owner_id', type: 'uuid' })
    owner_id: string;

    @Column({ name: 'storage_key', type: 'text' })
    storage_key: string;

    @Column({ name: 'original_name', length: 255 })
    original_name: string;

    @Column({ name: 'mime_type', length: 150 })
    mime_type: string;

    @Column({ name: 'size_bytes', type: 'int' })
    size_bytes: number;

    @Column({ name: 'uploaded_by', type: 'uuid' })
    uploaded_by: string;

    @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uploaded_by' })
    uploader: Cuenta;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}
