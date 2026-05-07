export const RECORD_CATEGORIES = [
    'conductual', 'academico', 'familiar', 'emocional', 'otro',
] as const;
export type RecordCategory = typeof RECORD_CATEGORIES[number];
 
export const WEEK_DAYS = [
    'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
] as const;
export type WeekDay = typeof WEEK_DAYS[number];
 
// Mapa de getDay() → nombre (para slots)
export const WEEK_DAY_BY_INDEX: readonly (WeekDay | 'domingo')[] = [
    'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
];