import {
    Entity, PrimaryColumn, Column,
    ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity.js';
import { Cuenta } from '../../users/entities/cuenta.entity.js';

@Entity('conversacion_participantes')
export class ConversationParticipant {
    @PrimaryColumn({ name: 'conversacion_id', type: 'uuid' })
    conversationId: string;

    @PrimaryColumn({ name: 'cuenta_id', type: 'uuid' })
    accountId: string;

    @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversacion_id' })
    conversation: Conversation;

    @ManyToOne(() => Cuenta, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cuenta_id' })
    account: Cuenta;

    @Column({ name: 'rol_en_conv', length: 20, default: 'participante' })
    role: string;

    @Column({ name: 'ultima_lectura_at', type: 'timestamp', nullable: true })
    lastReadAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}