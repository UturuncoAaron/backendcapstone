import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { ForumService } from './forum.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateForumBodyDto, ToggleForumDto } from './dto/forum.dto.js';
import type { AuthUser } from '../auth/types/auth-user.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses/:courseId/forums')
export class ForumController {
    constructor(private readonly forumService: ForumService) { }

    // GET /api/courses/:courseId/forums
    @Get()
    @Roles('alumno', 'docente', 'admin')
    getForums(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser() user: AuthUser,
    ) {
        const soloVisibles = user?.rol === 'alumno';
        return this.forumService.getForumsByCourse(courseId, soloVisibles);
    }

    // POST /api/courses/:courseId/forums
    @Post()
    @Roles('docente', 'admin')
    createForum(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() dto: CreateForumBodyDto,
    ) {
        return this.forumService.createForum(courseId, dto);
    }

    // PATCH /api/courses/:courseId/forums/:forumId/toggle
    @Patch(':forumId/toggle')
    @Roles('docente', 'admin')
    toggleForum(
        @Param('forumId', ParseUUIDPipe) forumId: string,
        @Body() dto: ToggleForumDto,
    ) {
        return this.forumService.toggleVisibility(forumId, dto.oculto);
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
        @CurrentUser() user: AuthUser,
    ) {
        return this.forumService.createPost(forumId, user.id, dto);
    }

    // DELETE /api/courses/:courseId/forums/:forumId/posts/:postId
    @Delete(':forumId/posts/:postId')
    @Roles('docente', 'admin')
    deletePost(@Param('postId', ParseUUIDPipe) postId: string) {
        return this.forumService.deletePost(postId);
    }
}
