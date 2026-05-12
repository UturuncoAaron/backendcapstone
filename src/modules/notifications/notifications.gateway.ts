import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { Notification } from './entities/notification.entity.js';

export interface SseFrame {
  event: 'notification' | 'ping' | 'connected';
  data: unknown;
}

const MAX_CONNECTIONS_PER_ACCOUNT = 5;

@Injectable()
export class NotificationsGateway {
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly streams = new Map<string, Subject<SseFrame>>();
  private readonly connectionCounts = new Map<string, number>();
  register(accountId: string): Subject<SseFrame> {
    const current = this.connectionCounts.get(accountId) ?? 0;
    if (current >= MAX_CONNECTIONS_PER_ACCOUNT) {
      throw new BadRequestException(
        `Máximo ${MAX_CONNECTIONS_PER_ACCOUNT} conexiones simultáneas por cuenta`,
      );
    }

    let subject = this.streams.get(accountId);
    if (!subject) {
      subject = new Subject<SseFrame>();
      this.streams.set(accountId, subject);
      this.logger.debug(`Nueva sesión SSE para cuenta=${accountId}`);
    }
    this.connectionCounts.set(accountId, current + 1);
    return subject;
  }

  /** Limpia el subject del usuario cuando ya no hay listeners conectados. */
  unregister(accountId: string): void {
    const current = this.connectionCounts.get(accountId) ?? 0;
    const next = Math.max(0, current - 1);

    if (next === 0) {
      this.connectionCounts.delete(accountId);
      const subject = this.streams.get(accountId);
      if (subject) {
        subject.complete();
        this.streams.delete(accountId);
        this.logger.debug(`Cerrada sesión SSE para cuenta=${accountId}`);
      }
    } else {
      this.connectionCounts.set(accountId, next);
    }
  }

  /** Empuja un evento a un usuario específico. */
  pushNotification(accountId: string, notif: Notification): void {
    const subject = this.streams.get(accountId);
    if (!subject) return;
    subject.next({ event: 'notification', data: notif });
  }

  /** Empuja a varios usuarios a la vez. */
  pushNotificationBulk(
    accountIds: string[],
    notifs: Map<string, Notification>,
  ): void {
    for (const accountId of accountIds) {
      const n = notifs.get(accountId);
      if (n) this.pushNotification(accountId, n);
    }
  }

  /** Heartbeat — envía un ping a TODAS las conexiones abiertas. */
  pingAll(): void {
    for (const subject of this.streams.values()) {
      subject.next({ event: 'ping', data: Date.now() });
    }
  }

  /** Métricas — útiles para `/healthz`. */
  getConnectedAccounts(): number {
    return this.streams.size;
  }
}