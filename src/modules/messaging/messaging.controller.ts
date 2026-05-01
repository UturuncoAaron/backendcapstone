import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { MessagingService } from './messaging.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
    CreateConversationDto,
    SendMessageDto,
    UpdateMessageDto,
} from './dto/messaging.dto.js';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('psicologa', 'docente', 'padre', 'alumno', 'admin')
export class MessagingController {

    constructor(private readonly service: MessagingService) { }

    // ── Conversations ─────────────────────────────────────────────────────────

    // POST /api/messaging/conversations
    @Post('conversations')
    createConversation(
        @Body() dto: CreateConversationDto,
        @CurrentUser() user: any,
    ) {
        return this.service.createConversation(user.sub, dto);
    }

    // GET /api/messaging/conversations — lista mis conversaciones con no leídos
    @Get('conversations')
    getMyConversations(@CurrentUser() user: any) {
        return this.service.getMyConversations(user.sub);
    }

    // GET /api/messaging/conversations/:id
    @Get('conversations/:id')
    getConversation(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.service.getConversationById(id, user.sub);
    }

    // PATCH /api/messaging/conversations/:id/archive
    @Patch('conversations/:id/archive')
    archiveConversation(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.service.archiveConversation(id, user.sub);
    }

    // ── Messages ──────────────────────────────────────────────────────────────

    // POST /api/messaging/conversations/:id/messages
    @Post('conversations/:id/messages')
    sendMessage(
        @Param('id', ParseUUIDPipe) conversationId: string,
        @Body() dto: SendMessageDto,
        @CurrentUser() user: any,
    ) {
        return this.service.sendMessage(conversationId, user.sub, dto);
    }

    // GET /api/messaging/conversations/:id/messages?limit=30&before=<timestamp>
    @Get('conversations/:id/messages')
    getMessages(
        @Param('id', ParseUUIDPipe) conversationId: string,
        @Query('limit') limit: string,
        @Query('before') before: string,
        @CurrentUser() user: any,
    ) {
        return this.service.getMessages(
            conversationId,
            user.sub,
            limit ? parseInt(limit) : 30,
            before,
        );
    }

    // PATCH /api/messaging/messages/:id
    @Patch('messages/:id')
    updateMessage(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateMessageDto,
        @CurrentUser() user: any,
    ) {
        return this.service.updateMessage(id, user.sub, dto);
    }

    // DELETE /api/messaging/messages/:id
    @Delete('messages/:id')
    deleteMessage(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.service.deleteMessage(id, user.sub);
    }

    // ── Read receipts ─────────────────────────────────────────────────────────

    // POST /api/messaging/conversations/:id/read
    @Post('conversations/:id/read')
    markAsRead(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.service.markAsRead(id, user.sub);
    }
}