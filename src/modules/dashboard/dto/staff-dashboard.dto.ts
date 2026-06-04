import { ComunicadoItem } from '../shared/shared-dashboard.queries.js';

export interface SeccionAsistenciaItem {
    seccionId: string;
    seccionNombre: string;
    gradoNombre: string;
    registrada: boolean;
    totalAlumnos: number;
    totalFaltas: number;
    totalTardanzas: number;
}


export interface StaffDashboardDto {
    seccionesHoy: SeccionAsistenciaItem[];
    comunicados: ComunicadoItem[];
}