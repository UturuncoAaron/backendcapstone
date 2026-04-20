import {
    Controller, Get, Post, Delete,
    Param, Body, ParseUUIDPipe,
} from '@nestjs/common';
import { ForumService } from './forum.service.js';

// TODO: agregar JwtAuthGuard + Roles cuando se implemente JWT
@Controller('courses/:courseId/forums')
export class ForumController {
    constructor(private readonly forumService: ForumService) { }

    // GET /api/courses/:courseId/forums
    @Get()
    getForums(@Param('courseId', ParseUUIDPipe) courseId: string) {
        return this.forumService.getForumsByCourse(courseId);
    }

    // POST /api/courses/:courseId/forums
    @Post()
    createForum(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() dto: { titulo: string; descripcion?: string },
    ) {
        return this.forumService.createForum(courseId, dto);
    }

    // GET /api/courses/:courseId/forums/:forumId
    @Get(':forumId')
    getPosts(@Param('forumId', ParseUUIDPipe) forumId: string) {
        return this.forumService.getPostsByForum(forumId);
    }

    // POST /api/courses/:courseId/forums/:forumId/posts
    @Post(':forumId/posts')
    createPost(
        @Param('forumId', ParseUUIDPipe) forumId: string,
        @Body() dto: { contenido: string; parent_post_id?: string },
    ) {
        // TODO: reemplazar 'usuario-temporal' con CurrentUser cuando JWT esté activo
        return this.forumService.createPost(forumId, 'usuario-temporal', dto);
    }

    // DELETE /api/courses/:courseId/forums/:forumId/posts/:postId
    @Delete(':forumId/posts/:postId')
    deletePost(@Param('postId', ParseUUIDPipe) postId: string) {
        return this.forumService.deletePost(postId);
    }
}