import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NOTIFICATION_TTL_DAYS } from './notifications.service.js';

/**
 * Sincroniza el esquema de la tabla `notificaciones` con la forma que esperan
 * la entidad y el servicio. Es idempotente y corre una sola vez al arrancar.
 *
 * El proyecto no usa migraciones de TypeORM (synchronize: false), así que
 * cualquier evolución del esquema vive acá para que el equipo no tenga que
 * correr SQL a mano en cada entorno.
 *
 * Cambios cubiertos:
 *  1. Asegura la columna `cuerpo` como NULLABLE (antes era NOT NULL).
 *  2. Agrega la columna `expires_at TIMESTAMPTZ` y un trigger BEFORE INSERT
 *     que la setea a `created_at + 14 días` si el cliente no la mandó.
 *  3. Crea el índice `idx_notif_expires` para que el job de limpieza no
 *     haga seq scan.
 */
@Injectable()
export class NotificationsSchemaSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsSchemaSync.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureColumns();
      await this.ensureExpiresTrigger();
      await this.ensureExpiresIndex();
      this.logger.log(
        'Tabla notificaciones sincronizada (expires_at + trigger + index)',
      );
    } catch (err) {
      this.logger.error(
        'Sincronización de esquema de notificaciones falló — revisar BD manualmente',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async ensureColumns(): Promise<void> {
    await this.dataSource.query(`
            ALTER TABLE notificaciones
                ALTER COLUMN cuerpo DROP NOT NULL;
            ALTER TABLE notificaciones
                ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
        `);
  }

  private async ensureExpiresTrigger(): Promise<void> {
    // Función que setea expires_at = created_at + 14 días si llega null.
    await this.dataSource.query(`
            CREATE OR REPLACE FUNCTION notificaciones_set_expires_at()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.expires_at IS NULL THEN
                    NEW.expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '${NOTIFICATION_TTL_DAYS} days';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

    await this.dataSource.query(`
            DROP TRIGGER IF EXISTS trg_notificaciones_expires ON notificaciones;
            CREATE TRIGGER trg_notificaciones_expires
                BEFORE INSERT ON notificaciones
                FOR EACH ROW
                EXECUTE FUNCTION notificaciones_set_expires_at();
        `);
  }

  private async ensureExpiresIndex(): Promise<void> {
    await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_notif_expires
                ON notificaciones (expires_at)
                WHERE expires_at IS NOT NULL;
        `);
  }
}
