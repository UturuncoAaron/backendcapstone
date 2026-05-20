import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AcademicYear } from './entities/academic-year.entity.js';
import { AcademicYearService } from './academic-year.service.js';
import { AcademicYearController } from './academic-year.controller.js';
import { AcademicYearCron } from './academic-year.cron.js';
import { AcademicYearSchemaSync } from './academic-year.schema-sync.js';

@Module({
  imports: [TypeOrmModule.forFeature([AcademicYear])],
  controllers: [AcademicYearController],
  providers: [AcademicYearService, AcademicYearCron, AcademicYearSchemaSync],
  exports: [AcademicYearService],
})
export class AcademicYearModule {}
