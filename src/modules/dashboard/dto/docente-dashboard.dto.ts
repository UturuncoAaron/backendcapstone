import { HorarioHoyItem, ComunicadoItem } from '../shared/shared-dashboard.queries';

export interface EntregaPendienteItem {
    tareaId: string;
    tareaTitulo: string;
    cursoNombre: string;
    totalSinCalificar: number;
    fechaLimite: Date;
}

export interface DocenteDashboardDto {
    horarioHoy: HorarioHoyItem[];
    entregasSinCalificar: EntregaPendienteItem[];
    comunicados: ComunicadoItem[];
}