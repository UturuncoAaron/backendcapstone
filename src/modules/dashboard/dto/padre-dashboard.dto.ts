import { ComunicadoItem } from '../shared/shared-dashboard.queries';

export interface HijoItem {
    alumnoId: string;
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    grado: string;
    seccion: string;
    seccionId: string;
    codigoEstudiante: string;
    fotoStorageKey: string | null;
    // Métricas rápidas
    promedioGeneral: number | null;
    porcentajeAsistencia: number | null;
    citasPendientes: number;
    asistioHoy: boolean | null;
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
    alumnoNombre: string;
}

export interface PadreDashboardDto {
    hijos: HijoItem[];
    citasProximas: CitaItem[];
    comunicados: ComunicadoItem[];
    libretas: LibretaItem[];
}