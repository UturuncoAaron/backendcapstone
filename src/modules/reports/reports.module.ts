import { Module } from '@nestjs/common';

import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

import { AcademicReportsController } from './academic/academic-reports.controller.js';
import { AcademicReportsService } from './academic/academic-reports.service.js';

import { AttendanceReportsController } from './attendance/attendance-reports.controller.js';
import { AttendanceReportsService } from './attendance/attendance-reports.service.js';

@Module({
  imports: [],
  controllers: [
    ReportsController,
    AcademicReportsController,
    AttendanceReportsController,
  ],
  providers: [ReportsService, AcademicReportsService, AttendanceReportsService],
})
export class ReportsModule {}
