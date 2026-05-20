export const MODULOS = {
    // ── Comunes
    DASHBOARD: 'dashboard',
    COMUNICADOS: 'comunicados',
    MENSAJES: 'mensajes',
    NOTIFICACIONES: 'notificaciones',
    PERFIL: 'perfil',

    // ── Alumno
    MIS_CURSOS: 'mis_cursos',
    MIS_TAREAS: 'mis_tareas',
    MIS_NOTAS: 'mis_notas',
    MI_ASISTENCIA: 'mi_asistencia',
    MIS_LIBRETAS: 'mis_libretas',
    MIS_CITAS: 'mis_citas',

    // ── Docente
    CURSOS_DOCENTE: 'cursos_docente',
    NOTAS_CURSO: 'notas_curso',
    ASIST_CURSO: 'asist_curso',
    TAREAS_GESTIONAR: 'tareas_gestionar',
    MATERIALES: 'materiales',
    CITAS_DOCENTE: 'citas_docente',
    DISPONIBILIDAD_DOCENTE: 'disponibilidad_docente',

    // ── Alumno + Docente
    FORO: 'foro',
    CLASES_VIVO: 'clases_vivo',

    // ── Tutor
    TUTORIA: 'tutoria',
    ASIST_GENERAL: 'asist_general',

    // ── Padre
    HIJOS: 'hijos',
    LIBRETAS_HIJOS: 'libretas_hijos',
    CITAS_AGENDADAS: 'citas_agendadas',
    CITAS_PADRE: 'citas_padre',

    // ── Psicóloga
    CASOS: 'casos',
    CITAS: 'citas',
    FICHAS: 'fichas',
    DISPONIBILIDAD: 'disponibilidad',

    // ── Agenda propia
    AGENDA_PROPIA: 'agenda_propia',

    // ── Reportes
    REPORTES_GLOBALES: 'reportes_globales',
    REPORTES_ACCESO: 'reportes_acceso',

    // ── Libretas padres
    // Admin lo tiene en su base. Docente lo recibe vía permisos_extra.
    LIBRETAS_PADRE_ACCESO: 'libretas_padre_acceso',

    // ── Admin
    USUARIOS: 'usuarios',
    PERIODOS: 'periodos',
    GRADOS_SECCIONES: 'grados_secciones',
    CURSOS_ADMIN: 'cursos_admin',
    MATRICULAS: 'matriculas',
    PADRE_HIJO_ADMIN: 'padre_hijo',
    REPORTES_GLOBALES_KEY: 'reportes_globales',
    COMUNICADOS_ADMIN: 'comunicados_admin',
    IMPORTAR: 'importar',
    AJUSTES: 'ajustes',
    HISTORICO_ALUMNOS: 'historico_alumnos',
} as const;

export type Modulo = (typeof MODULOS)[keyof typeof MODULOS];

const COMUNES: Modulo[] = [
    MODULOS.DASHBOARD, MODULOS.NOTIFICACIONES, MODULOS.PERFIL,
];

export const MODULOS_POR_ROL: Record<string, Modulo[]> = {
    alumno: [
        MODULOS.MIS_CURSOS, MODULOS.MIS_TAREAS, MODULOS.MIS_NOTAS,
        MODULOS.MI_ASISTENCIA, MODULOS.MIS_LIBRETAS, MODULOS.MIS_CITAS,
        MODULOS.FORO, MODULOS.CLASES_VIVO,
        MODULOS.COMUNICADOS, MODULOS.MENSAJES,
        ...COMUNES,
    ],
    docente: [
        MODULOS.CURSOS_DOCENTE, MODULOS.NOTAS_CURSO, MODULOS.ASIST_CURSO,
        MODULOS.TAREAS_GESTIONAR, MODULOS.MATERIALES,
        MODULOS.CITAS_DOCENTE, MODULOS.DISPONIBILIDAD_DOCENTE,
        MODULOS.FORO, MODULOS.CLASES_VIVO,
        MODULOS.COMUNICADOS, MODULOS.MENSAJES,
        ...COMUNES,
    ],
    // El auxiliar es un rol operativo dedicado a asistencias. NO participa
    // del flujo de citas (ni como convocador, ni declarando disponibilidad,
    // ni como convocable). Si en el futuro se quiere darle acceso a citas,
    // hacerlo con un permiso explícito vía `permisos_extra`, no metiéndole
    // de vuelta MODULOS.AGENDA_PROPIA en la base del rol.
    auxiliar: [
        MODULOS.ASIST_GENERAL,
        MODULOS.COMUNICADOS,
        ...COMUNES,
    ],
    psicologa: [
        MODULOS.CASOS, MODULOS.CITAS, MODULOS.FICHAS, MODULOS.DISPONIBILIDAD,
        MODULOS.COMUNICADOS, MODULOS.MENSAJES,
        ...COMUNES,
    ],
    padre: [
        MODULOS.HIJOS, MODULOS.LIBRETAS_HIJOS,
        MODULOS.CITAS_AGENDADAS, MODULOS.CITAS_PADRE,
        MODULOS.COMUNICADOS, MODULOS.MENSAJES,
        ...COMUNES,
    ],
    admin: [
        MODULOS.USUARIOS, MODULOS.PERIODOS, MODULOS.GRADOS_SECCIONES,
        MODULOS.CURSOS_ADMIN, MODULOS.MATRICULAS, MODULOS.PADRE_HIJO_ADMIN,
        MODULOS.REPORTES_GLOBALES, MODULOS.COMUNICADOS_ADMIN,
        MODULOS.IMPORTAR, MODULOS.AJUSTES,
        MODULOS.HISTORICO_ALUMNOS,
        MODULOS.AGENDA_PROPIA,
        MODULOS.MENSAJES,
        MODULOS.LIBRETAS_PADRE_ACCESO, // ← admin siempre puede subir libretas de padres
        ...COMUNES,
    ],
};

export function getModulosBasePorRol(rol: string): Modulo[] {
    return MODULOS_POR_ROL[rol] ?? [];
}