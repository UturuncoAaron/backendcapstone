import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { HistoricoController } from './historico.controller.js';
import { HistoricoService } from './historico.service.js';
import { Alumno } from '../users/entities/alumno.entity.js';
import { StorageModule } from '../storage/storage.module.js';

/**
 * Módulo Histórico de Alumnos.
 *
 * Expone endpoints de solo lectura para consultar la matrícula histórica
 * de los alumnos por año académico (alumnos + matriculas + secciones
 * + grados + periodos). Reutiliza el esquema existente y los índices
 * `idx_alumnos_anio_ingreso`, `idx_matriculas_historico`,
 * `idx_periodos_anio` ya presentes en la BD.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Alumno]), StorageModule],
  controllers: [HistoricoController],
  providers: [HistoricoService],
  exports: [HistoricoService],
})
export class HistoricoModule {}
