import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SharedDashboardQueries } from './shared/shared-dashboard.queries';
import { AlumnoDashboardProvider } from './providers/alumno-dashboard.provider';
import { DocenteDashboardProvider } from './providers/docente-dashboard.provider';
import { PadreDashboardProvider } from './providers/padre-dashboard.provider';
import { AdminDashboardProvider } from './providers/admin-dashboard.provider';
import { PsicologaDashboardProvider } from './providers/psicologa-dashboard.provider';
import { AuxiliarDashboardProvider } from './providers/auxiliar-dashboard.provider';

@Module({
    controllers: [DashboardController],
    providers: [
        DashboardService,
        SharedDashboardQueries,
        AlumnoDashboardProvider,
        DocenteDashboardProvider,
        PadreDashboardProvider,
        AdminDashboardProvider,
        PsicologaDashboardProvider,
        AuxiliarDashboardProvider,
    ],
})
export class DashboardModule { }