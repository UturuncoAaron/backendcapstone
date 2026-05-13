import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Forum } from './entities/forum.entity.js';
import { ForumPost } from './entities/forum-post.entity.js';
import { ForumController } from './forum.controller.js';
import { ForumMyController } from './forum-my.controller.js';
import { ForumService } from './forum.service.js';
import { SemanasModule } from '../semanas/semanas.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Forum, ForumPost]),
        SemanasModule,
        AttachmentsModule,
    ],
    controllers: [ForumController, ForumMyController],
    providers: [ForumService],
})
export class ForumModule {}
