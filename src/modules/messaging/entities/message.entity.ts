import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
    CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('mensajes')
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'conversacion_id' })
    conversationId: string;

    @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversacion_id' })
    conversation: Conversation;

    @Column({ name: 'remitente_id' })
    senderId: string;

    @ManyToOne(() => Cuenta, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'remitente_id' })
    sender: Cuenta;

    @Column({ type: 'text' })
    contenido: string;

    @Column({ name: 'adjunto_storage_key', nullable: true })
    attachmentStorageKey: string;

    @Column({ name: 'adjunto_nombre', length: 255, nullable: true })
    attachmentName: string;

    @Column({ default: false })
    editado: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}