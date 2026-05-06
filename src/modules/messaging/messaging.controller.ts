import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { MessagingService } from './messaging.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';
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
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.createConversation(user.id, dto);
    }

    // GET /api/messaging/conversations — lista mis conversaciones con no leídos
    @Get('conversations')
    getMyConversations(@CurrentUser() user: AuthUser) {
        return this.service.getMyConversations(user.id);
    }

    // GET /api/messaging/conversations/:id
    @Get('conversations/:id')
    getConversation(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getConversationById(id, user.id);
    }

    // PATCH /api/messaging/conversations/:id/archive
    @Patch('conversations/:id/archive')
    archiveConversation(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.archiveConversation(id, user.id);
    }

    // ── Messages ──────────────────────────────────────────────────────────────

    // POST /api/messaging/conversations/:id/messages
    @Post('conversations/:id/messages')
    sendMessage(
        @Param('id', ParseUUIDPipe) conversationId: string,
        @Body() dto: SendMessageDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.sendMessage(conversationId, user.id, dto);
    }

    // GET /api/messaging/conversations/:id/messages?limit=30&before=<timestamp>
    @Get('conversations/:id/messages')
    getMessages(
        @Param('id', ParseUUIDPipe) conversationId: string,
        @Query('limit') limit: string,
        @Query('before') before: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.getMessages(
            conversationId,
            user.id,
            limit ? parseInt(limit) : 30,
            before,
        );
    }

    // PATCH /api/messaging/messages/:id
    @Patch('messages/:id')
    updateMessage(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateMessageDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.updateMessage(id, user.id, dto);
    }

    // DELETE /api/messaging/messages/:id
    @Delete('messages/:id')
    deleteMessage(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.deleteMessage(id, user.id);
    }

    // ── Read receipts ─────────────────────────────────────────────────────────

    // POST /api/messaging/conversations/:id/read
    @Post('conversations/:id/read')
    markAsRead(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.service.markAsRead(id, user.id);
    }
}