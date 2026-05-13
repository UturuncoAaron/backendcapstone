import { AttachmentsService } from '../attachments/attachments.service.js';
import {
    Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Conversation } from './entities/conversation.entity.js';
import { ConversationParticipant } from './entities/conversation-participant.entity.js';
import { Message } from './entities/message.entity.js';
import {
    CreateConversationDto,
    SendMessageDto,
    UpdateMessageDto,
} from './dto/messaging.dto.js';

@Injectable()
export class MessagingService {

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(ConversationParticipant) private participantRepo: Repository<ConversationParticipant>,
        @InjectRepository(Message) private messageRepo: Repository<Message>,
        private readonly dataSource: DataSource,
        private readonly attachments: AttachmentsService,
    ) { }

    // ════════════════════════════════════════════════════════════
    // CONVERSATIONS
    // ════════════════════════════════════════════════════════════

    async createConversation(creatorId: string, dto: CreateConversationDto): Promise<Conversation> {
        return this.dataSource.transaction(async (manager) => {
            // 1. Crear conversación
            const conversation = manager.create(Conversation, {
                tipo: dto.tipo,
                studentId: dto.studentId ?? null,
            });
            const saved = await manager.save(conversation);

            // 2. Agregar creador como iniciador
            await manager.save(ConversationParticipant, {
                conversationId: saved.id,
                accountId: creatorId,
                role: 'iniciador',
            });

            // 3. Agregar resto de participantes
            for (const participantId of dto.participantIds) {
                if (participantId !== creatorId) {
                    await manager.save(ConversationParticipant, {
                        conversationId: saved.id,
                        accountId: participantId,
                        role: 'participante',
                    });
                }
            }

            return saved;
        });
    }

    async getMyConversations(accountId: string): Promise<any[]> {
        // Retorna conversaciones del usuario con último mensaje y cantidad no leídos
        const result = await this.dataSource.query(`
            SELECT
                c.id,
                c.tipo,
                c.estado,
                c.updated_at,
                cp.ultima_lectura_at,
                -- Último mensaje
                (
                    SELECT json_build_object(
                        'contenido', m.contenido,
                        'created_at', m.created_at,
                        'remitente_id', m.remitente_id
                    )
                    FROM mensajes m
                    WHERE m.conversacion_id = c.id
                    ORDER BY m.created_at DESC
                    LIMIT 1
                ) AS last_message,
                -- Mensajes no leídos
                (
                    SELECT COUNT(*)::int
                    FROM mensajes m
                    WHERE m.conversacion_id = c.id
                    AND (cp.ultima_lectura_at IS NULL OR m.created_at > cp.ultima_lectura_at)
                ) AS unread_count,
                -- Contexto alumno
                CASE WHEN c.alumno_id IS NOT NULL THEN
                    json_build_object(
                        'id', a.id,
                        'nombre', a.nombre,
                        'apellido_paterno', a.apellido_paterno
                    )
                ELSE NULL END AS student
            FROM conversaciones c
            INNER JOIN conversacion_participantes cp ON cp.conversacion_id = c.id
            LEFT JOIN alumnos a ON a.id = c.alumno_id
            WHERE cp.cuenta_id = $1
            AND c.estado = 'activa'
            ORDER BY c.updated_at DESC
        `, [accountId]);

        return result;
    }

    async getConversationById(conversationId: string, accountId: string): Promise<Conversation> {
        await this.assertParticipant(conversationId, accountId);
        const conv = await this.convRepo.findOne({
            where: { id: conversationId },
            relations: ['student'],
        });
        if (!conv) throw new NotFoundException('Conversation not found');
        return conv;
    }

    async archiveConversation(conversationId: string, accountId: string): Promise<void> {
        // Solo el iniciador puede archivar
        const participant = await this.participantRepo.findOne({
            where: { conversationId, accountId, role: 'iniciador' },
        });
        if (!participant) throw new ForbiddenException('Only the creator can archive this conversation');
        await this.convRepo.update(conversationId, { estado: 'archivada' });
    }

    // ════════════════════════════════════════════════════════════
    // MESSAGES
    // ════════════════════════════════════════════════════════════

    async sendMessage(conversationId: string, senderId: string, dto: SendMessageDto): Promise<Message> {
        await this.assertParticipant(conversationId, senderId);

        const message = this.messageRepo.create({
            conversationId,
            senderId,
            contenido: dto.contenido,
            attachmentStorageKey: dto.attachmentStorageKey ?? null,
            attachmentName: dto.attachmentName ?? null,
        });

        const saved = await this.messageRepo.save(message);

        // Actualizar updated_at de la conversación para que suba al top
        await this.convRepo.update(conversationId, { updatedAt: new Date() } as any);

        return saved;
    }

    async getMessages(
        conversationId: string,
        accountId: string,
        limit = 30,
        before?: string,
    ): Promise<(Message & { attachments: import('../attachments/attachments.service.js').AttachmentDto[] })[]> {
        await this.assertParticipant(conversationId, accountId);

        const qb = this.messageRepo
            .createQueryBuilder('m')
            .leftJoinAndSelect('m.sender', 'sender')
            .where('m.conversacion_id = :conversationId', { conversationId })
            .orderBy('m.created_at', 'DESC')
            .take(limit);

        if (before) {
            qb.andWhere('m.created_at < :before', { before: new Date(before) });
        }

        const messages = await qb.getMany();
        // Bulk loader de adjuntos para evitar N+1.
        const map = await this.attachments.listByOwnersBulk('message', messages.map(m => m.id));
        const enriched = messages.map(m => ({
            ...m,
            attachments: map.get(m.id) ?? [],
        }));
        // Retornar en orden cronológico (más antiguo primero)
        return enriched.reverse();
    }

    async updateMessage(messageId: string, senderId: string, dto: UpdateMessageDto): Promise<Message> {
        const message = await this.messageRepo.findOne({ where: { id: messageId } });
        if (!message) throw new NotFoundException('Message not found');
        if (message.senderId !== senderId) throw new ForbiddenException('You can only edit your own messages');

        message.contenido = dto.contenido;
        message.editado = true;
        return this.messageRepo.save(message);
    }

    async deleteMessage(messageId: string, senderId: string): Promise<void> {
        const message = await this.messageRepo.findOne({ where: { id: messageId } });
        if (!message) throw new NotFoundException('Message not found');
        if (message.senderId !== senderId) throw new ForbiddenException('You can only delete your own messages');
        // Borrar adjuntos del mensaje primero (limpia R2 + filas)
        await this.attachments.removeByOwner('message', message.id);
        await this.messageRepo.remove(message);
    }

    // ════════════════════════════════════════════════════════════
    // READ RECEIPTS
    // ════════════════════════════════════════════════════════════

    async markAsRead(conversationId: string, accountId: string): Promise<void> {
        await this.assertParticipant(conversationId, accountId);
        await this.participantRepo.update(
            { conversationId, accountId },
            { lastReadAt: new Date() },
        );
    }

    // ════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ════════════════════════════════════════════════════════════

    private async assertParticipant(conversationId: string, accountId: string): Promise<void> {
        const participant = await this.participantRepo.findOne({
            where: { conversationId, accountId },
        });
        if (!participant) {
            throw new ForbiddenException('You are not a participant of this conversation');
        }
    }
}