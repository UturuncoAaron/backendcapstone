import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Announcement } from './entities/announcement.entity.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Announcement]),
        AttachmentsModule,
        PermissionsModule,
    ],
    controllers: [AnnouncementsController],
    providers: [AnnouncementsService],
})
export class AnnouncementsModule { }