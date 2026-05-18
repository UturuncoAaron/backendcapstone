import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Sincroniza el esquema de comunicados y comunicados_lecturas.
 * Es idempotente y corre una sola vez al arrancar.
 */
@Injectable()
export class AnnouncementsSchemaSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnnouncementsSchemaSync.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureComunicadosColumns();
      await this.ensureLecturasTable();
      this.logger.log('Esquema de comunicados sincronizado');
    } catch (err) {
      this.logger.error(
        'Sincronización de esquema de comunicados falló',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async ensureComunicadosColumns(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE comunicados
        ADD COLUMN IF NOT EXISTS periodo_id UUID,
        ADD COLUMN IF NOT EXISTS importante BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS fijado BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS fijado_hasta TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS vistas INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    `);
  }

  private async ensureLecturasTable(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS comunicados_lecturas (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
        cuenta_id     UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
        leido_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (comunicado_id, cuenta_id)
      );

      CREATE INDEX IF NOT EXISTS idx_comunicados_lecturas_comunicado
        ON comunicados_lecturas (comunicado_id);

      CREATE INDEX IF NOT EXISTS idx_comunicados_lecturas_cuenta
        ON comunicados_lecturas (cuenta_id);
    `);
  }
}
