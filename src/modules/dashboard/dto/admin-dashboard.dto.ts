export interface ContadoresItem {
    totalAlumnos: number;
    totalDocentes: number;
    totalPadres: number;
    totalAuxiliares: number;
}

export interface AlertaOperativaItem {
    tipo: 'sin_docente' | 'sin_horario' | 'contrato_por_vencer';
    descripcion: string;
    referencia: string;
}

export interface AdminDashboardDto {
    contadores: ContadoresItem;
    alertas: AlertaOperativaItem[];
}