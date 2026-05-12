import {
  Controller,
  Get,
  Patch,
  Sse,
  Param,
  Query,
  Header,
  ParseUUIDPipe,
  UseGuards,
  MessageEvent,
} from '@nestjs/common';
import { Observable, defer, from, merge, interval, finalize } from 'rxjs';
import { map } from 'rxjs/operators';
import { NotificationsService } from './notifications.service.js';
import { NotificationsGateway, SseFrame } from './notifications.gateway.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';

const ALL_ROLES = [
  'alumno',
  'padre',
  'docente',
  'psicologa',
  'admin',
  'auxiliar',
] as const;

const SSE_HEARTBEAT_MS = 25_000;

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_ROLES)
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly gateway: NotificationsGateway,
  ) { }

  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    const subject = this.gateway.register(user.id);

    const heartbeat$ = interval(SSE_HEARTBEAT_MS).pipe(
      map<number, SseFrame>(() => ({ event: 'ping', data: Date.now() })),
    );

    const hello$ = defer(() =>
      from<SseFrame[]>([{ event: 'connected', data: { ts: Date.now() } }]),
    );

    return merge(hello$, subject.asObservable(), heartbeat$).pipe(
      map((frame) => ({
        type: frame.event,
        data: JSON.stringify(frame.data),
      })),
      finalize(() => this.gateway.unregister(user.id)),
    );
  }

  @Get()
  getMyNotifications(
    @CurrentUser() user: AuthUser,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.service.getMyNotifications(user.id, {
      onlyUnread: unread === 'true',
      limit: limit ? Number(limit) : undefined,
      before,
    });
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: AuthUser) {
    return this.service.getUnreadCount(user.id).then((count) => ({ count }));
  }

  @Patch(':id/read')
  markOneAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.markOneAsRead(id, user.id);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllAsRead(user.id);
  }
  @Get('health')
  @Roles('admin')
  health() {
    return {
      sseConnectedAccounts: this.gateway.getConnectedAccounts(),
      timestamp: new Date().toISOString(),
    };
  }
}