import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { Notification } from './entities/notification.entity.js';

/**
 * Mensaje SSE que se envía a un usuario.
 *
 * `event` distingue entre:
 *  - `'notification'` → notificación nueva (con `data` = Notification).
 *  - `'ping'`         → heartbeat para mantener viva la conexión (data vacío).
 *  - `'connected'`    → ack inicial al abrir el stream.
 */
export interface SseFrame {
  event: 'notification' | 'ping' | 'connected';
  data: unknown;
}

/**
 * Mantiene una conexión SSE por usuario y permite hacer push de eventos
 * desde otros servicios sin acoplarlos a HTTP.
 *
 * Escalabilidad:
 *  - Cada usuario tiene UN `Subject<SseFrame>` compartido entre todas sus
 *    pestañas/devices (multicast).
 *  - El gateway expone `registerListener` / `unregisterListener` así una
 *    sola conexión por pestaña basta para recibir todos los eventos.
 *  - Si en el futuro se escala horizontalmente (varias instancias del API),
 *    este gateway se reemplaza por Redis pub/sub manteniendo la API
 *    `pushToUser(accountId, frame)` intacta.
 */
@Injectable()
export class NotificationsGateway {
  private readonly logger = new Logger(NotificationsGateway.name);

  /** accountId → Subject que multicastea eventos a las suscripciones activas. */
  private readonly streams = new Map<string, Subject<SseFrame>>();

  /** Devuelve (o crea) el `Subject` para un usuario y suma un listener. */
  register(accountId: string): Subject<SseFrame> {
    let subject = this.streams.get(accountId);
    if (!subject) {
      subject = new Subject<SseFrame>();
      this.streams.set(accountId, subject);
      this.logger.debug(`Nueva sesión SSE para cuenta=${accountId}`);
    }
    return subject;
  }

  /** Limpia el subject del usuario cuando ya no hay listeners conectados. */
  unregister(accountId: string): void {
    const subject = this.streams.get(accountId);
    if (!subject) return;
    if (!subject.observed) {
      subject.complete();
      this.streams.delete(accountId);
      this.logger.debug(`Cerrada sesión SSE para cuenta=${accountId}`);
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
