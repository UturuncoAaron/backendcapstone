import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AcademicYear } from './entities/academic-year.entity.js';
import { AcademicYearService } from './academic-year.service.js';

/**
 * Cron diario que avanza automáticamente el ciclo de vida de los años
 * lectivos. No fuerza la promoción (eso lo decide el admin desde el UI),
 * pero sí dispara la desactivación de egresados 30 días después del cierre.
 *
 * Se ejecuta una vez al día (03:00 hora del servidor). Es idempotente: si
 * no hay nada que hacer, no hace nada.
 */
@Injectable()
export class AcademicYearCron {
  private readonly logger = new Logger(AcademicYearCron.name);

  constructor(
    @InjectRepository(AcademicYear)
    private readonly repo: Repository<AcademicYear>,
    private readonly service: AcademicYearService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'academic-year-daily-tick' })
  async dailyTick(): Promise<void> {
    this.logger.log('Cron diario de años lectivos: inicio');
    try {
      await this.autoDeactivateEgresados();
    } catch (err) {
      this.logger.error(
        'Cron diario de años lectivos falló',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Para cada año en estado 'cerrado' con `egresados_desactivados_at = NULL`
   * y `fecha_fin + 30 días <= hoy`, dispara la desactivación.
   *
   * Si la promoción no se ejecutó todavía (admin no apretó el botón),
   * NO desactivamos — los egresados quedarían sin marcar y los volveríamos
   * a tocar al correr promoción.
   */
  private async autoDeactivateEgresados(): Promise<void> {
    const candidatos = await this.repo
      .createQueryBuilder('ay')
      .where('ay.estado = :estado', { estado: 'cerrado' })
      .andWhere('ay.egresadosDesactivadosAt IS NULL')
      .andWhere('ay.promocionEjecutadaAt IS NOT NULL')
      .andWhere(`ay.fechaFin + INTERVAL '30 days' <= NOW()`)
      .getMany();

    for (const ay of candidatos) {
      try {
        const res = await this.service.runEgresadoDeactivation(ay.anio);
        this.logger.log(
          `Cron: desactivó ${res.desactivados} egresados del año ${ay.anio}`,
        );
      } catch (err) {
        this.logger.error(
          `Cron: falló desactivación de egresados ${ay.anio}`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
}
