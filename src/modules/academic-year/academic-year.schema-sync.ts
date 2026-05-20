import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Sincroniza el esquema del módulo de año lectivo. Todo idempotente —
 * pensado para correr en cada boot sin efectos colaterales.
 *
 * Cambios cubiertos:
 *  1. Crear tabla `anios_lectivos` (single source of truth temporal anual).
 *  2. Agregar `matriculas.condicion_final` (pendiente/aprobado/desaprobado/
 *     retirado) — alimenta la lógica de promoción.
 *  3. Asegurar `matriculas.anio` NOT NULL una vez que toda la data ya
 *     tiene anio (no rompe si quedan filas viejas).
 *  4. Asegurar índices anuales útiles.
 */
@Injectable()
export class AcademicYearSchemaSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(AcademicYearSchemaSync.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.syncAniosLectivos();
      await this.syncMatriculasCondicionFinal();
      await this.syncMatriculasAnioNotNull();
      await this.seedAnioActualSiVacio();
    } catch (err) {
      this.logger.error(
        'Sincronización de esquema de año lectivo falló — revisar BD manualmente',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async syncAniosLectivos(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS anios_lectivos (
        id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        anio                        SMALLINT     NOT NULL UNIQUE,
        fecha_inicio                DATE         NOT NULL,
        fecha_fin                   DATE         NOT NULL,
        estado                      VARCHAR(20)  NOT NULL DEFAULT 'planificado'
                                       CHECK (estado IN ('planificado','en_curso','cerrado','archivado')),
        promocion_ejecutada_at      TIMESTAMPTZ  NULL,
        egresados_desactivados_at   TIMESTAMPTZ  NULL,
        created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_anio_lectivo_fechas CHECK (fecha_fin > fecha_inicio)
      );
      CREATE INDEX IF NOT EXISTS idx_anios_lectivos_estado
        ON anios_lectivos (estado, fecha_fin DESC);
    `);
    this.logger.log('Tabla anios_lectivos sincronizada');
  }

  private async syncMatriculasCondicionFinal(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE matriculas
        ADD COLUMN IF NOT EXISTS condicion_final VARCHAR(20)
          NOT NULL DEFAULT 'pendiente';
      ALTER TABLE matriculas
        DROP CONSTRAINT IF EXISTS chk_matricula_condicion_final;
      ALTER TABLE matriculas
        ADD CONSTRAINT chk_matricula_condicion_final
        CHECK (condicion_final IN ('pendiente','aprobado','desaprobado','retirado'));
      CREATE INDEX IF NOT EXISTS idx_matriculas_anio_condicion
        ON matriculas (anio, condicion_final) WHERE activo = TRUE;
    `);
    this.logger.log('matriculas.condicion_final sincronizada');
  }

  private async syncMatriculasAnioNotNull(): Promise<void> {
    // Solo subimos a NOT NULL si TODA la data tiene anio. Si quedan filas
    // legadas con NULL, las dejamos para que admin las corrija a mano.
    const [{ pendientes }] = await this.dataSource.query<
      [{ pendientes: string }]
    >(`SELECT COUNT(*)::text AS pendientes FROM matriculas WHERE anio IS NULL`);
    if (Number(pendientes) === 0) {
      await this.dataSource.query(`
        ALTER TABLE matriculas ALTER COLUMN anio SET NOT NULL;
      `);
      this.logger.log('matriculas.anio = NOT NULL aplicado');
    } else {
      this.logger.warn(
        `matriculas.anio: ${pendientes} filas con NULL — no se promueve a NOT NULL`,
      );
    }
  }

  /**
   * Si no hay ningún año lectivo creado, sembramos uno default usando el
   * año del calendario actual con fechas razonables (marzo-diciembre). El
   * admin lo puede editar luego desde el UI.
   */
  private async seedAnioActualSiVacio(): Promise<void> {
    const [{ count }] = await this.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*)::text AS count FROM anios_lectivos`,
    );
    if (Number(count) > 0) return;
    const anio = new Date().getUTCFullYear();
    await this.dataSource.query(
      `INSERT INTO anios_lectivos (anio, fecha_inicio, fecha_fin, estado)
       VALUES ($1, $2, $3, 'en_curso')
       ON CONFLICT (anio) DO NOTHING`,
      [anio, `${anio}-03-01`, `${anio}-12-20`],
    );
    this.logger.log(`anios_lectivos: sembrado año ${anio} (en_curso)`);
  }
}
