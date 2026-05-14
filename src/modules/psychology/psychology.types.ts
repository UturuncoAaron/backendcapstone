export const RECORD_CATEGORIES = [
    'conductual', 'academico', 'familiar', 'emocional', 'otro',
] as const;
export type RecordCategory = typeof RECORD_CATEGORIES[number];

// ── Informes psicológicos ────────────────────────────────────────────────
// Reportes formales que la psicóloga elabora sobre un alumno. Pueden
// derivarse a la familia, a un especialista externo, o quedarse como
// seguimiento interno. Cuando se "finaliza", queda inmutable y puede
// imprimirse / guardarse como PDF desde el navegador.
export const INFORME_TIPOS = [
    'evaluacion',           // Evaluación psicológica inicial / periódica
    'seguimiento',          // Reporte de seguimiento de un caso
    'derivacion_familia',   // Derivación a los padres / tutor
    'derivacion_externa',   // Derivación a especialista externo
] as const;
export type InformeTipo = typeof INFORME_TIPOS[number];

export const INFORME_ESTADOS = ['borrador', 'finalizado'] as const;
export type InformeEstado = typeof INFORME_ESTADOS[number];
 
export const WEEK_DAYS = [
    'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
] as const;
export type WeekDay = typeof WEEK_DAYS[number];
 
// Mapa de getDay() → nombre (para slots)
export const WEEK_DAY_BY_INDEX: readonly (WeekDay | 'domingo')[] = [
    'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
];