import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity.js';
import { ConversationParticipant } from './entities/conversation-participant.entity.js';
import { Message } from './entities/message.entity.js';
import { MessagingService } from './messaging.service.js';
import { MessagingController } from './messaging.controller.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Conversation,
            ConversationParticipant,
            Message,
        ]),
        AttachmentsModule,
    ],
    controllers: [MessagingController],
    providers: [MessagingService],
    exports: [MessagingService],
})
export class MessagingModule { }