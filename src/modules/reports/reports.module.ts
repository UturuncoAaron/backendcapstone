import { Module } from '@nestjs/common';

// Controllers existentes
import { ReportsController } from './reports.controller.js';
import { AcademicReportsController } from './academic/academic-reports.controller.js';
import { AttendanceReportsController } from './attendance/attendance-reports.controller.js';

// Controllers nuevos
import { TeacherAttendanceController } from './teacher-attendance/teacher-attendance.controller.js';
import { SectionReportController } from './section/section-report.controller.js';
import { AlumnoReportController } from './alumno-report/alumno-report.controller.js';

// Services existentes
import { ReportsService } from './reports.service.js';
import { AcademicReportsService } from './academic/academic-reports.service.js';
import { AttendanceReportsService } from './attendance/attendance-reports.service.js';

// Services nuevos
import { TeacherAttendanceService } from './teacher-attendance/teacher-attendance.service.js';
import { SectionReportService } from './section/section-report.service.js';
import { XlsxBuilderService } from './excel/xlsx-builder.service.js';
import { AlumnoReportService } from './alumno-report/alumno-report.service.js';
import { AlumnoReportXlsxBuilder } from './alumno-report/alumno-report-xlsx.service.js';

import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [StorageModule],
  controllers: [
    ReportsController,
    AcademicReportsController,
    AttendanceReportsController,
    TeacherAttendanceController,
    SectionReportController,
    AlumnoReportController,
  ],
  providers: [
    ReportsService,
    AcademicReportsService,
    AttendanceReportsService,
    TeacherAttendanceService,
    SectionReportService,
    XlsxBuilderService,
    AlumnoReportService,
    AlumnoReportXlsxBuilder,
  ],
  exports: [],
})
export class ReportsModule {}
