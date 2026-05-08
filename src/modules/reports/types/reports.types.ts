// ─────────────────────────────────────────────────────────────────────────────
// SHARED
// ─────────────────────────────────────────────────────────────────────────────

export type ReportFormat = 'json' | 'xlsx' | 'csv';

export type EscalaCalificacion = 'AD' | 'A' | 'B' | 'C' | 'Sin notas';

export type EstadoAsistenciaAlumno =
    | 'asistio'
    | 'falta'
    | 'tardanza'
    | 'justificado'
    | 'sin-registro';

export type EstadoAsistenciaDocente =
    | 'presente'
    | 'tardanza'
    | 'ausente'
    | 'permiso'
    | 'licencia'
    | 'sin-registro';

export type CategoriaRendimiento = 'top' | 'normal' | 'riesgo' | 'sin-datos';

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN — reporte maestro
// ─────────────────────────────────────────────────────────────────────────────

export interface SeccionInfo {
    id: string;
    nombre: string;
    grado: string;
    grado_orden: number;
    tutor_nombre: string | null;
    tutor_id: string | null;
    capacidad: number;
    total_matriculados: number;
}

export interface PeriodoInfo {
    id: string;
    nombre: string;
    anio: number;
    bimestre: number;
    fecha_inicio: string;
    fecha_fin: string;
    activo: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTAS
// ─────────────────────────────────────────────────────────────────────────────

/** Row crudo de pg — A1 libreta */
export interface LibretaRow {
    curso_id: string;
    curso: string;
    docente: string | null;
    total_notas: number;
    promedio: string | null; // pg devuelve numeric como string
    nota_min: string | null;
    nota_max: string | null;
}

/** A2 cuadro de notas */
export interface CuadroNotasRow {
    alumno_id: string;
    dni: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    alumno_nombre: string;
    nota_id: string | null;
    actividad: string | null;
    tipo: string | null;
    nota: string | null;
    fecha: string | null;
}

/** A3 promedios por curso */
export interface PromedioCursoRow {
    alumno_id: string;
    dni: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    notas_registradas: number;
    promedio: string | null;
    escala: EscalaCalificacion;
}

/** A6 top y riesgo */
export interface TopRiesgoRow {
    alumno_id: string;
    dni: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    promedio_general: string | null;
    cursos_en_riesgo: number;
    categoria: CategoriaRendimiento;
}

/** Reporte maestro de sección — notas */
export interface SeccionNotasRow {
    alumno_id: string;
    dni: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    curso_id: string;
    curso: string;
    total_notas: number;
    promedio: string | null;
    escala: EscalaCalificacion;
}

// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA ALUMNOS
// ─────────────────────────────────────────────────────────────────────────────

export interface AsistenciaDiariaRow {
    alumno_id: string;
    dni: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    estado: EstadoAsistenciaAlumno;
    observacion: string | null;
    fecha: string | null;
}

export interface ResumenAsistenciaRow {
    alumno_id: string;
    dni: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    dias_registrados: number;
    asistencias: number;
    tardanzas: number;
    faltas: number;
    justificadas: number;
    porcentaje_asistencia: string | null;
}

export interface TopInasistenteRow {
    alumno_id: string;
    dni: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    faltas: number;
    tardanzas: number;
    justificadas: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA DOCENTES
// ─────────────────────────────────────────────────────────────────────────────
export interface HorarioDelDiaRow {
    horario_id: string;
    curso_id: string;
    curso_nombre: string;
    seccion_nombre: string;
    grado_nombre: string;
    docente_id: string;
    docente_nombre: string;
    dia_semana: string;
    hora_inicio: string;
    hora_fin: string;
    aula: string | null;
    // Si ya existe un registro hoy, viene aquí
    asistencia_id: string | null;
    estado_actual: EstadoAsistenciaDocente | null;
    hora_llegada: string | null;
    tiene_justificacion: boolean | null;
    motivo_justificacion: string | null;
    hubo_reemplazo: boolean | null;
    observacion: string | null;
}

/** Reporte diario de docentes */
export interface AsistenciaDocenteDiariaRow {
    asistencia_id: string | null;
    horario_id: string;
    docente_id: string;
    docente_nombre: string;
    docente_apellido_paterno: string;
    docente_apellido_materno: string | null;
    curso_nombre: string;
    seccion_nombre: string;
    grado_nombre: string;
    hora_inicio: string;
    hora_fin: string;
    aula: string | null;
    estado: EstadoAsistenciaDocente;
    hora_llegada: string | null;
    tiene_justificacion: boolean;
    motivo_justificacion: string | null;
    hubo_reemplazo: boolean;
    observacion: string | null;
}

/** Reporte semanal/por rango de docente */
export interface ResumenAsistenciaDocenteRow {
    docente_id: string;
    docente_nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    total_bloques_esperados: number;
    presentes: number;
    tardanzas: number;
    ausentes: number;
    permisos: number;
    licencias: number;
    sin_registro: number;
    ausentes_sin_justificacion: number;
    porcentaje_asistencia: string | null;
}

/** Top docentes con más ausencias — alerta director */
export interface AlertaAusenciaDocenteRow {
    docente_id: string;
    docente_nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    total_ausencias: number;
    sin_justificacion: number;
    clases_sin_cobertura: number;
    ultima_ausencia: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAREAS
// ─────────────────────────────────────────────────────────────────────────────

export interface EntregasTareaRow {
    tarea_id: string;
    titulo: string;
    fecha_limite: string;
    bimestre: number | null;
    semana: number | null;
    total_alumnos: number;
    entregaron: number;
    pendientes: number;
    con_retraso: number;
    calificadas: number;
    promedio_calificacion: string | null;
    porcentaje_entrega: string | null;
}

export interface EntregaAlumnoRow {
    alumno_id: string;
    dni: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    tarea_id: string;
    tarea_titulo: string;
    fecha_limite: string;
    entrego: boolean;
    con_retraso: boolean;
    calificacion_final: string | null;
    fecha_entrega: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE MAESTRO SECCIÓN (combina notas + asistencia + tareas)
// ─────────────────────────────────────────────────────────────────────────────

export interface SeccionResumenResponse {
    seccion: SeccionInfo;
    periodo: PeriodoInfo;
    ranking: TopRiesgoRow[];
    notas_por_curso: SeccionNotasRow[];
    resumen_asistencia: ResumenAsistenciaRow[];
    top_inasistentes: TopInasistenteRow[];
    entregas_por_tarea: EntregasTareaRow[];
}