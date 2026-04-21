/**
 * Plantilla de cursos estándar por grado — secundaria peruana (DCN/CNEB)
 * Al crear una sección nueva, se generan estos cursos automáticamente.
 * El docente se asigna después con PATCH /api/courses/:id/assign-teacher
 */
export const CURSOS_POR_GRADO: Record<number, string[]> = {
    // 1ro de Secundaria (grado orden 7 en tu BD)
    7: [
        'Matemática',
        'Comunicación',
        'Inglés',
        'Historia, Geografía y Economía',
        'Formación Ciudadana y Cívica',
        'Persona, Familia y Relaciones Humanas',
        'Ciencia, Tecnología y Ambiente',
        'Educación para el Trabajo',
        'Educación Física',
        'Arte y Cultura',
        'Educación Religiosa',
    ],
    // 2do de Secundaria
    8: [
        'Matemática',
        'Comunicación',
        'Inglés',
        'Historia, Geografía y Economía',
        'Formación Ciudadana y Cívica',
        'Persona, Familia y Relaciones Humanas',
        'Ciencia, Tecnología y Ambiente',
        'Educación para el Trabajo',
        'Educación Física',
        'Arte y Cultura',
        'Educación Religiosa',
    ],
    // 3ro de Secundaria
    9: [
        'Matemática',
        'Comunicación',
        'Inglés',
        'Historia, Geografía y Economía',
        'Formación Ciudadana y Cívica',
        'Persona, Familia y Relaciones Humanas',
        'Ciencia, Tecnología y Ambiente',
        'Educación para el Trabajo',
        'Educación Física',
        'Arte y Cultura',
        'Educación Religiosa',
    ],
    // 4to de Secundaria
    10: [
        'Matemática',
        'Comunicación',
        'Inglés',
        'Historia, Geografía y Economía',
        'Formación Ciudadana y Cívica',
        'Persona, Familia y Relaciones Humanas',
        'Ciencia, Tecnología y Ambiente',
        'Educación para el Trabajo',
        'Educación Física',
        'Arte y Cultura',
        'Educación Religiosa',
    ],
    // 5to de Secundaria
    11: [
        'Matemática',
        'Comunicación',
        'Inglés',
        'Historia, Geografía y Economía',
        'Formación Ciudadana y Cívica',
        'Persona, Familia y Relaciones Humanas',
        'Ciencia, Tecnología y Ambiente',
        'Educación para el Trabajo',
        'Educación Física',
        'Arte y Cultura',
        'Educación Religiosa',
    ],
};

/**
 * Colores hex para identificar visualmente cada curso en la UI
 */
export const COLORES_CURSOS: Record<string, string> = {
    'Matemática': '#3B82F6', // azul
    'Comunicación': '#10B981', // verde
    'Inglés': '#F59E0B', // amarillo
    'Historia, Geografía y Economía': '#EF4444', // rojo
    'Formación Ciudadana y Cívica': '#8B5CF6', // violeta
    'Persona, Familia y Relaciones Humanas': '#EC4899', // rosa
    'Ciencia, Tecnología y Ambiente': '#06B6D4', // cyan
    'Educación para el Trabajo': '#F97316', // naranja
    'Educación Física': '#84CC16', // lima
    'Arte y Cultura': '#A855F7', // púrpura
    'Educación Religiosa': '#6B7280', // gris
};