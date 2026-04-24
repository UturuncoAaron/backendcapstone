import {
    Controller, Get, Post, Delete,
    Param, Body, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { ForumService } from './forum.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses/:courseId/forums')
export class ForumController {
    constructor(private readonly forumService: ForumService) { }

    // GET /api/courses/:courseId/forums
    @Get()
    @Roles('alumno', 'docente', 'admin')
    getForums(@Param('courseId', ParseUUIDPipe) courseId: string) {
        return this.forumService.getForumsByCourse(courseId);
    }

    // POST /api/courses/:courseId/forums
    @Post()
    @Roles('docente', 'admin')
    createForum(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() dto: { titulo: string; descripcion?: string },
    ) {
        return this.forumService.createForum(courseId, dto);
    }

    // GET /api/courses/:courseId/forums/:forumId
    @Get(':forumId')
    @Roles('alumno', 'docente', 'admin')
    getPosts(@Param('forumId', ParseUUIDPipe) forumId: string) {
        return this.forumService.getPostsByForum(forumId);
    }

    // POST /api/courses/:courseId/forums/:forumId/posts
    @Post(':forumId/posts')
    @Roles('alumno', 'docente', 'admin')
    createPost(
        @Param('forumId', ParseUUIDPipe) forumId: string,
        @Body() dto: { contenido: string; parent_post_id?: string },
        @CurrentUser() user: any,
    ) {
        return this.forumService.createPost(forumId, user.sub, dto);
    }

    // DELETE /api/courses/:courseId/forums/:forumId/posts/:postId
    @Delete(':forumId/posts/:postId')
    @Roles('docente', 'admin')
    deletePost(@Param('postId', ParseUUIDPipe) postId: string) {
        return this.forumService.deletePost(postId);
    }
}