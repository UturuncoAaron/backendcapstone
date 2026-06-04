import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SharedDashboardQueries } from './shared/shared-dashboard.queries';
import { AlumnoDashboardProvider } from './providers/alumno-dashboard.provider';
import { DocenteDashboardProvider } from './providers/docente-dashboard.provider';
import { PadreDashboardProvider } from './providers/padre-dashboard.provider';
import { AdminDashboardProvider } from './providers/admin-dashboard.provider';
import { PsicologaDashboardProvider } from './providers/psicologa-dashboard.provider';
import { StaffDashboardProvider } from './providers/staff-dashboard.provider';
import { StorageModule } from '../storage/storage.module';

@Module({
    imports: [StorageModule],
    controllers: [DashboardController],
    providers: [
        DashboardService,
        SharedDashboardQueries,
        AlumnoDashboardProvider,
        DocenteDashboardProvider,
        PadreDashboardProvider,
        AdminDashboardProvider,
        PsicologaDashboardProvider,
        StaffDashboardProvider,
    ],
})
export class DashboardModule { }