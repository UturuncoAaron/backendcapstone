import { BadRequestException, Injectable } from '@nestjs/common';
import { AlumnoDashboardProvider } from './providers/alumno-dashboard.provider';
import { DocenteDashboardProvider } from './providers/docente-dashboard.provider';
import { PadreDashboardProvider } from './providers/padre-dashboard.provider';
import { AdminDashboardProvider } from './providers/admin-dashboard.provider';
import { PsicologaDashboardProvider } from './providers/psicologa-dashboard.provider';
import { AuxiliarDashboardProvider } from './providers/auxiliar-dashboard.provider';

@Injectable()
export class DashboardService {
    constructor(
        private readonly alumno: AlumnoDashboardProvider,
        private readonly docente: DocenteDashboardProvider,
        private readonly padre: PadreDashboardProvider,
        private readonly admin: AdminDashboardProvider,
        private readonly psicologa: PsicologaDashboardProvider,
        private readonly auxiliar: AuxiliarDashboardProvider,
    ) { }

    getResumen(rol: string, userId: string) {
        switch (rol) {
            case 'alumno': return this.alumno.getResumen(userId);
            case 'docente': return this.docente.getResumen(userId);
            case 'padre': return this.padre.getResumen(userId);
            case 'admin': return this.admin.getResumen();
            case 'psicologa': return this.psicologa.getResumen(userId);
            case 'auxiliar': return this.auxiliar.getResumen(userId);
            default: throw new BadRequestException(`Rol desconocido: ${rol}`);
        }
    }
}