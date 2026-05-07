export interface HorarioItem {
    dia: string;
    horaInicio: string;
    horaFin: string;
    aula: string | null;
    cursoNombre: string;
    color: string;
    docenteNombre: string;
}

export interface TareaPendienteItem {
    id: string;
    titulo: string;
    tipo: string;
    fechaLimite: Date;
    cursoNombre: string;
}

export interface ComunicadoItem {
    id: string;
    titulo: string;
    contenido: string;
    fecha: Date;
}

export interface AlumnoDashboardDto {
    horario: HorarioItem[];
    tareasPendientes: TareaPendienteItem[];
    comunicados: ComunicadoItem[];
}