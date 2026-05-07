import { ComunicadoItem } from '../shared/shared-dashboard.queries';

export interface HijoItem {
    alumnoId: string;
    nombre: string;
    apellidoPaterno: string;
    grado: string;
    seccion: string;
}

export interface CitaItem {
    id: string;
    tipo: string;
    modalidad: string;
    fechaHora: Date;
    estado: string;
    convocadoPor: string;
    alumnoNombre: string;
}

export interface LibretaItem {
    id: string;
    periodoNombre: string;
    storageKey: string;
    creadaEn: Date;
}

export interface PadreDashboardDto {
    hijos: HijoItem[];
    citasProximas: CitaItem[];
    comunicados: ComunicadoItem[];
    libretas: LibretaItem[];
}