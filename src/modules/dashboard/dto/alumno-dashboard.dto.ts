export class HorarioItemDto {
    dia: string;
    horaInicio: string;
    horaFin: string;
    aula: string | null;
    cursoNombre: string;
    docenteNombre: string;
    color: string;
}

export class TareaPendienteDto {
    id: string;
    titulo: string;
    cursoNombre: string;
    fechaLimite: string;
    tipo: 'tarea';
}

export class ComunicadoDto {
    id: string;
    titulo: string;
    contenido: string;
    fecha: string;
}

export class AlumnoDashboardDto {
    horario: HorarioItemDto[];
    tareasPendientes: TareaPendienteDto[];
    comunicados: ComunicadoDto[];
}