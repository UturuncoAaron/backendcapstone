import {
    Controller, Get, Patch, Delete,
    Param, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('alumno', 'padre', 'docente', 'psicologa', 'admin')
export class NotificationsController {

    constructor(private readonly service: NotificationsService) { }

    // GET /api/notifications?unread=true
    @Get()
    getMyNotifications(
        @CurrentUser() user: any,
        @Query('unread') unread: string,
    ) {
        return this.service.getMyNotifications(user.sub, unread === 'true');
    }

    // GET /api/notifications/unread-count
    @Get('unread-count')
    getUnreadCount(@CurrentUser() user: any) {
        return this.service.getUnreadCount(user.sub).then(count => ({ count }));
    }

    // PATCH /api/notifications/:id/read
    @Patch(':id/read')
    markOneAsRead(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        return this.service.markOneAsRead(id, user.sub);
    }

    // PATCH /api/notifications/read-all
    @Patch('read-all')
    markAllAsRead(@CurrentUser() user: any) {
        return this.service.markAllAsRead(user.sub);
    }
}