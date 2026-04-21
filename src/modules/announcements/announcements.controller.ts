import { Controller, Get, Post, Delete, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service.js';
import { CreateAnnouncementDto } from './dto/create-announcement.dto.js';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto.js';

// TODO: agregar JwtAuthGuard + Roles cuando se implemente JWT
@Controller('announcements')
export class AnnouncementsController {
    constructor(private readonly announcementsService: AnnouncementsService) { }

    // GET /api/announcements — todos los roles ven comunicados
    @Get()
    findAll(@Query() query: QueryAnnouncementsDto) {
        return this.announcementsService.findAll(query);
    }

    // GET /api/announcements/:id — ver comunicado específico
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.announcementsService.findOne(id);
    }

    // POST /api/announcements — solo admin crea comunicados
    @Post()
    create(@Body() dto: CreateAnnouncementDto) {
        // TODO: reemplazar con CurrentUser cuando JWT esté activo
        const adminId = 'hardcoded-admin-id-replace-with-jwt';
        return this.announcementsService.create(adminId, dto);
    }

    // DELETE /api/announcements/:id — solo admin elimina (soft delete)
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.announcementsService.remove(id);
    }
}