import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Announcement } from './entities/announcement.entity.js';
import { ComunicadoLectura } from './entities/comunicado-lectura.entity.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';
import { AnnouncementsSchemaSync } from './announcements.schema-sync.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Announcement, ComunicadoLectura]),
        AttachmentsModule,
        PermissionsModule,
        StorageModule,
    ],
    controllers: [AnnouncementsController],
    providers: [AnnouncementsService, AnnouncementsSchemaSync],
})
export class AnnouncementsModule { }