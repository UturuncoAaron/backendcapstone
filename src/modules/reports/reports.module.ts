import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { AcademicReportsController } from './academic/academic-reports.controller.js';
import { AttendanceReportsController } from './attendance/attendance-reports.controller.js';
import { TeacherAttendanceController } from './teacher-attendance/teacher-attendance.controller.js';
import { SectionReportController } from './section/section-report.controller.js';
import { AlumnoReportController } from './alumno-report/alumno-report.controller.js';
import { PsychologyReportController } from './psychology-report/psychology-report.controller.js';
import { ReportsService } from './reports.service.js';
import { AcademicReportsService } from './academic/academic-reports.service.js';
import { AttendanceReportsService } from './attendance/attendance-reports.service.js';
import { TeacherAttendanceService } from './teacher-attendance/teacher-attendance.service.js';
import { SectionReportService } from './section/section-report.service.js';
import { XlsxBuilderService } from './excel/xlsx-builder.service.js';
import { AlumnoReportService } from './alumno-report/alumno-report.service.js';
import { AlumnoReportXlsxBuilder } from './alumno-report/alumno-report-xlsx.service.js';
import { AlumnoReportPdfBuilder } from './alumno-report/alumno-report-pdf.service.js';
import { PsychologyReportService } from './psychology-report/psychology-report.service.js';
import { PdfGenerator } from './pdf/pdf.generator.js';
import { AttendanceXlsxBuilder, PersonalXlsxBuilder } from './attendance/attendance-xlsx-builder.service.js';
import { AttendancePdfBuilder } from './attendance/attendance-pdf-builder.service.js';

import { StorageModule } from '../storage/storage.module.js';
import { PsychologyModule } from '../psychology/psychology.module.js';

@Module({
  imports: [StorageModule, PsychologyModule],
  controllers: [
    ReportsController,
    AcademicReportsController,
    AttendanceReportsController,
    TeacherAttendanceController,
    SectionReportController,
    AlumnoReportController,
    PsychologyReportController,
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
    AlumnoReportPdfBuilder,
    AttendanceXlsxBuilder,
    AttendancePdfBuilder,
    PersonalXlsxBuilder,
    PsychologyReportService,
    PdfGenerator,
  ],
  exports: [PsychologyReportService],
})
export class ReportsModule { }