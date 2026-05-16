import { Controller, Get, UseGuards } from '@nestjs/common';
import { ForumService } from './forum.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

/**
 * Endpoint plano fuera del prefijo `courses/:courseId/forums`.
 * Reemplaza el N+1 del frontend: 1 fetch por curso → 1 fetch global.
 */
@Controller('forums')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ForumMyController {
    constructor(private readonly forumService: ForumService) { }

    @Get('my')
    @Roles('alumno', 'docente', 'admin')
    getMyForums(@CurrentUser() user: AuthUser) {
        return this.forumService.getMyForums(user.id, user.rol);
    }
}
