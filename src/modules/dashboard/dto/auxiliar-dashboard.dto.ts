import { ComunicadoItem } from '../shared/shared-dashboard.queries';

export interface SeccionAsistenciaItem {
    seccionId: string;
    seccionNombre: string;
    gradoNombre: string;
    registrada: boolean;
    totalAlumnos: number;
    totalFaltas: number;
    totalTardanzas: number;
}

export interface AuxiliarDashboardDto {
    seccionesHoy: SeccionAsistenciaItem[];
    comunicados: ComunicadoItem[];
}