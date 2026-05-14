import { HorarioHoyItem, HorarioSemanaItem, ComunicadoItem } from '../shared/shared-dashboard.queries';

export interface EntregaPendienteItem {
    tareaId: string;
    tareaTitulo: string;
    cursoNombre: string;
    totalSinCalificar: number;
    fechaLimite: Date;
}

export interface DocenteDashboardDto {
    /** Clases de hoy (para el card "Hoy"). */
    horarioHoy: HorarioHoyItem[];
    /**
     * Horario semanal completo del docente. El frontend pinta la grilla
     * "Mi horario semanal" usando este campo. Antes solo recibía
     * `horarioHoy` y se mostraba vacío fuera del día.
     */
    horario: HorarioSemanaItem[];
    entregasSinCalificar: EntregaPendienteItem[];
    comunicados: ComunicadoItem[];
}