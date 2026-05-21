import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AcademicYear } from './entities/academic-year.entity.js';
import { AcademicYearService } from './academic-year.service.js';

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
