import { BadRequestException, Injectable } from '@nestjs/common';
import { AlumnoDashboardProvider } from './providers/alumno-dashboard.provider.js';
import { DocenteDashboardProvider } from './providers/docente-dashboard.provider.js';
import { PadreDashboardProvider } from './providers/padre-dashboard.provider.js';
import { AdminDashboardProvider } from './providers/admin-dashboard.provider.js';
import { PsicologaDashboardProvider } from './providers/psicologa-dashboard.provider.js';
import { StaffDashboardProvider } from './providers/staff-dashboard.provider.js';

@Injectable()
export class DashboardService {
    constructor(
        private readonly alumno: AlumnoDashboardProvider,
        private readonly docente: DocenteDashboardProvider,
        private readonly padre: PadreDashboardProvider,
        private readonly admin: AdminDashboardProvider,
        private readonly psicologa: PsicologaDashboardProvider,
        private readonly staff: StaffDashboardProvider,
    ) { }

    getResumen(rol: string, userId: string) {
        switch (rol) {
            case 'alumno': return this.alumno.getResumen(userId);
            case 'docente': return this.docente.getResumen(userId);
            case 'padre': return this.padre.getResumen(userId);
            case 'admin': return this.admin.getResumen();
            case 'psicologa': return this.psicologa.getResumen(userId);
            case 'staff': return this.staff.getResumen(userId);
            default: throw new BadRequestException(`Rol desconocido: ${rol}`);
        }
    }
}