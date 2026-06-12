import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AppointmentsSchemaSync implements OnApplicationBootstrap {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

  async onApplicationBootstrap(): Promise<void> {
    // Limpieza de constraints legacy
    await this.dataSource.query(
      `ALTER TABLE disponibilidad_cuenta
        DROP CONSTRAINT IF EXISTS uq_disp_cuenta_dia_hora`,
    );

    await this.dataSource.query(
      `DROP INDEX IF EXISTS uq_disp_cuenta_specific_fecha_hora`,
    );

    // Índice único para weekly (dia+hora por cuenta)
    await this.dataSource.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_disp_cuenta_weekly_dia_hora
        ON disponibilidad_cuenta (cuenta_id, dia_semana, hora_inicio)
        WHERE tipo = 'weekly'`,
    );

    // Índice para overrides specific (fecha+hora por cuenta)
    await this.dataSource.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_disp_cuenta_specific_fecha_hora_v2
        ON disponibilidad_cuenta (cuenta_id, fecha_especifica, hora_inicio)
        WHERE tipo = 'specific' AND activo = TRUE`,
    );

    // Índice para consultas de overrides por fecha
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_disp_cuenta_specific_fecha
        ON disponibilidad_cuenta (cuenta_id, fecha_especifica)
        WHERE tipo = 'specific'`,
    );
  }
}