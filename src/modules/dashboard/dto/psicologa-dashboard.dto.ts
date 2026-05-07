import { ComunicadoItem } from '../shared/shared-dashboard.queries';

export interface CitaHoyItem {
    id: string;
    tipo: string;
    modalidad: string;
    fechaHora: Date;
    duracionMin: number;
    alumnoNombre: string;
    alumnoId: string;
    estado: string;
}

export interface AlumnoSeguimientoItem {
    alumnoId: string;
    nombre: string;
    apellidoPaterno: string;
    grado: string;
    seccion: string;
    desde: Date;
}

export interface PsicologaDashboardDto {
    citasHoy: CitaHoyItem[];
    alumnosEnSeguimiento: AlumnoSeguimientoItem[];
    comunicados: ComunicadoItem[];
}