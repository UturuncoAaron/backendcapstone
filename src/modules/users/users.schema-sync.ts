import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Sincronización idempotente del esquema del módulo `users`.
 *
 * El proyecto no usa migraciones de TypeORM (`synchronize: false`), así que
 * los cambios incrementales del esquema viven acá para no obligar a correr
 * SQL manual en cada entorno.
 *
 * Cambios cubiertos:
 *
 *  1. `alumnos.inclusivo` — nueva columna booleana para marcar alumnos con
 *     necesidades educativas especiales (inclusión educativa). La fila se
 *     muestra con un acento visual en la tabla y el modal de creación
 *     expone un checkbox para activarla.
 */
@Injectable()
export class UsersSchemaSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersSchemaSync.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.syncInclusivoColumn();
    } catch (err) {
      // No tiramos la app por un fallo de sync — los endpoints
      // devolverán errores claros si la columna sigue faltando.
      this.logger.error(
        'Sincronización de esquema de users falló — revisar BD manualmente',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Añade `alumnos.inclusivo BOOLEAN NOT NULL DEFAULT FALSE` si todavía no
   * existe. `ADD COLUMN IF NOT EXISTS` es nativo de Postgres ≥ 9.6, así
   * que basta con una sola sentencia.
   */
  private async syncInclusivoColumn(): Promise<void> {
    await this.dataSource.query(`
            ALTER TABLE alumnos
                ADD COLUMN IF NOT EXISTS inclusivo BOOLEAN NOT NULL DEFAULT FALSE;
        `);
    this.logger.log('alumnos.inclusivo asegurado');
  }
}
