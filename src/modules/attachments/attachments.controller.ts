import {
    Controller, Get, Post, Delete,
    Param, Query, Body, UseGuards, UseInterceptors,
    UploadedFile, ParseUUIDPipe, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AttachmentsService, ATTACHMENT_MAX_BYTES } from './attachments.service.js';
import { UploadAttachmentDto, ListAttachmentsQueryDto } from './dto/attachments.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attachments')
export class AttachmentsController {
    constructor(private readonly svc: AttachmentsService) { }

    /** POST /api/attachments  (multipart: file + owner_type + owner_id) */
    @Post()
    @UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: ATTACHMENT_MAX_BYTES },
    }))
    upload(
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: UploadAttachmentDto,
        @CurrentUser() user: AuthUser,
    ) {
        if (!file) throw new BadRequestException('Falta el archivo (campo: file)');
        return this.svc.create(file, dto.owner_type, dto.owner_id, user.id);
    }

    /** GET /api/attachments?owner_type=forum_post&owner_id=... */
    @Get()
    list(@Query() q: ListAttachmentsQueryDto) {
        return this.svc.listByOwner(q.owner_type, q.owner_id);
    }

    /** DELETE /api/attachments/:id  — autor o admin. */
    @Delete(':id')
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.svc.remove(id, user.id, user.rol);
    }
}
