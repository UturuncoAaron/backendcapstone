import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentsController } from './attachments.controller.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
    imports: [TypeOrmModule.forFeature([Attachment]), StorageModule],
    providers: [AttachmentsService],
    controllers: [AttachmentsController],
    exports: [AttachmentsService],
})
export class AttachmentsModule { }
