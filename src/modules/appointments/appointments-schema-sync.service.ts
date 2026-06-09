import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AppointmentsSchemaSync implements OnApplicationBootstrap {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.dataSource.query(
      `ALTER TABLE disponibilidad_cuenta
        DROP CONSTRAINT IF EXISTS uq_disp_cuenta_dia_hora`,
    );

    await this.dataSource.query(
      `UPDATE disponibilidad_cuenta
        SET fecha_especifica = NULL
        WHERE tipo = 'weekly'
          AND fecha_especifica IS NOT NULL`,
    );

    await this.dataSource.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_disp_cuenta_weekly_dia_hora
        ON disponibilidad_cuenta (cuenta_id, dia_semana, hora_inicio)
        WHERE tipo = 'weekly'`,
    );

    await this.dataSource.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_disp_cuenta_specific_fecha_hora
        ON disponibilidad_cuenta (cuenta_id, fecha_especifica, hora_inicio)
        WHERE tipo = 'specific' AND fecha_especifica IS NOT NULL`,
    );
  }
}
