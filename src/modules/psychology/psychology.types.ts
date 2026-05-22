// psychology/psychology.types.ts
export const RECORD_CATEGORIES = [
    'conductual', 'academico', 'familiar', 'emocional', 'otro',
] as const;
export type RecordCategory = typeof RECORD_CATEGORIES[number];

export const INFORME_TIPOS = [
    'evaluacion',
    'seguimiento',
    'derivacion_familia',
    'derivacion_externa',
] as const;
export type InformeTipo = typeof INFORME_TIPOS[number];

export const INFORME_ESTADOS = ['borrador', 'finalizado'] as const;
export type InformeEstado = typeof INFORME_ESTADOS[number];

export const ARCHIVO_CATEGORIAS = ['ficha', 'test', 'informe'] as const;
export type ArchivoCategoria = typeof ARCHIVO_CATEGORIAS[number];

export const WEEK_DAYS = [
    'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
] as const;
export type WeekDay = typeof WEEK_DAYS[number];

export const WEEK_DAY_BY_INDEX: readonly (WeekDay | 'domingo')[] = [
    'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
];
