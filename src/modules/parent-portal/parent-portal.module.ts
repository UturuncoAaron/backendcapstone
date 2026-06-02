import { Module } from '@nestjs/common';
import { ParentPortalController } from './parent-portal.controller.js';
import { ParentPortalService } from './parent-portal.service.js';
import { PsychologyModule } from '../psychology/psychology.module.js';
import { ReportsModule } from '../reports/reports.module.js';

@Module({
    imports: [PsychologyModule, ReportsModule],
    controllers: [ParentPortalController],
    providers: [ParentPortalService],
})
export class ParentPortalModule {}