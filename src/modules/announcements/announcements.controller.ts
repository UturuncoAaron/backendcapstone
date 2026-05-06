import {
    Controller, Get, Post, Delete,
    Param, Body, Query,
    ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service.js';
import { CreateAnnouncementDto } from './dto/create-announcement.dto.js';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('announcements')
export class AnnouncementsController {
    constructor(private readonly announcementsService: AnnouncementsService) { }

    // GET /api/announcements — todos los roles ven comunicados
    @Get()
    @Roles('alumno', 'docente', 'admin', 'padre', 'psicologa')
    findAll(@Query() query: QueryAnnouncementsDto) {
        return this.announcementsService.findAll(query);
    }

    // GET /api/announcements/:id
    @Get(':id')
    @Roles('alumno', 'docente', 'admin', 'padre', 'psicologa')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.announcementsService.findOne(id);
    }

    @Post()
    @Roles('admin')
    create(
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateAnnouncementDto,
    ) {
        return this.announcementsService.create(user.id, dto);
    }

    // DELETE /api/announcements/:id — solo admin (soft delete)
    @Delete(':id')
    @Roles('admin')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.announcementsService.remove(id);
    }
}