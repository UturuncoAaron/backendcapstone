import { Module } from '@nestjs/common';
import { StudentPortalController } from './student-portal.controller.js';
import { StudentPortalService } from './student-portal.service.js';
import { PsychologyModule } from '../psychology/psychology.module.js';
import { ReportsModule } from '../reports/reports.module.js';

@Module({
    imports: [PsychologyModule, ReportsModule],
    controllers: [StudentPortalController],
    providers: [StudentPortalService],
})
export class StudentPortalModule { }