import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Announcement } from './entities/announcement.entity.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([Announcement])],
    controllers: [AnnouncementsController],
    providers: [AnnouncementsService],
})
export class AnnouncementsModule { }