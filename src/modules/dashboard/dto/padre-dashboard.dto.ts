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
    /** Signed URL listo para abrir en una pestaña nueva. */
    url: string | null;
    creadaEn: Date;
    /** Nombre del alumno cuando tipo='alumno'. 'Mi libreta' cuando tipo='padre'. */
    alumnoNombre: string;
    /** 'alumno' = libreta del hijo; 'padre' = libreta dirigida al padre. */
    tipo: 'alumno' | 'padre';
}

export interface PadreDashboardDto {
    hijos: HijoItem[];
    citasProximas: CitaItem[];
    comunicados: ComunicadoItem[];
    libretas: LibretaItem[];
}