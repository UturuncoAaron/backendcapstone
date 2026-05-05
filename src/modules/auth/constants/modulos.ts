// Ubicación en tu proyecto: src/modules/auth/constants/modulos.ts
// Catálogo MAESTRO de módulos. Frontend y backend deben usar EXACTAMENTE estos strings.

export const MODULOS = {
    // ── Comunes a varios roles
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

    // ── Docente
    CURSOS_DOCENTE: 'cursos_docente',
    NOTAS_CURSO: 'notas_curso',
    ASIST_CURSO: 'asist_curso',
    TAREAS_GESTIONAR: 'tareas_gestionar',
    MATERIALES: 'materiales',

    // ── Compartido alumno + docente
    FORO: 'foro',
    CLASES_VIVO: 'clases_vivo',

    // ── Tutor (docente con secciones.tutor_id) — extras automáticos
    TUTORIA: 'tutoria',
    ASIST_GENERAL: 'asist_general',

    // ── Padre
    HIJOS: 'hijos',
    LIBRETAS_HIJOS: 'libretas_hijos',
    CITAS_AGENDADAS: 'citas_agendadas',

    // ── Psicóloga
    CASOS: 'casos',
    CITAS: 'citas',
    FICHAS: 'fichas',
    DISPONIBILIDAD: 'disponibilidad',

    // ── Admin
    USUARIOS: 'usuarios',
    PERIODOS: 'periodos',
    GRADOS_SECCIONES: 'grados_secciones',
    CURSOS_ADMIN: 'cursos_admin',
    MATRICULAS: 'matriculas',
    PADRE_HIJO_ADMIN: 'padre_hijo',
    REPORTES_GLOBALES: 'reportes_globales',
    COMUNICADOS_ADMIN: 'comunicados_admin',
    IMPORTAR: 'importar',
    AJUSTES: 'ajustes',
} as const;

export type Modulo = (typeof MODULOS)[keyof typeof MODULOS];

const COMUNES: Modulo[] = [
    MODULOS.DASHBOARD, MODULOS.NOTIFICACIONES, MODULOS.PERFIL,
];

export const MODULOS_POR_ROL: Record<string, Modulo[]> = {
    alumno: [
        MODULOS.MIS_CURSOS, MODULOS.MIS_TAREAS, MODULOS.MIS_NOTAS,
        MODULOS.MI_ASISTENCIA, MODULOS.MIS_LIBRETAS,
        MODULOS.FORO, MODULOS.CLASES_VIVO,
        MODULOS.COMUNICADOS, MODULOS.MENSAJES,
        ...COMUNES,
    ],
    docente: [
        MODULOS.CURSOS_DOCENTE, MODULOS.NOTAS_CURSO, MODULOS.ASIST_CURSO,
        MODULOS.TAREAS_GESTIONAR, MODULOS.MATERIALES,
        MODULOS.FORO, MODULOS.CLASES_VIVO,
        MODULOS.COMUNICADOS, MODULOS.MENSAJES,
        ...COMUNES,
    ],
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
        MODULOS.HIJOS, MODULOS.LIBRETAS_HIJOS, MODULOS.CITAS_AGENDADAS,
        MODULOS.COMUNICADOS, MODULOS.MENSAJES,
        ...COMUNES,
    ],
    admin: [
        MODULOS.USUARIOS, MODULOS.PERIODOS, MODULOS.GRADOS_SECCIONES,
        MODULOS.CURSOS_ADMIN, MODULOS.MATRICULAS, MODULOS.PADRE_HIJO_ADMIN,
        MODULOS.REPORTES_GLOBALES, MODULOS.COMUNICADOS_ADMIN,
        MODULOS.IMPORTAR, MODULOS.AJUSTES,
        MODULOS.MENSAJES,
        ...COMUNES,
    ],
};

export function getModulosBasePorRol(rol: string): Modulo[] {
    return MODULOS_POR_ROL[rol] ?? [];
}
