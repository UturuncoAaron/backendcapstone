/**
 * reports.queries.ts
 *
 * SINGLE SOURCE OF TRUTH para todas las queries SQL del módulo de reportes.
 *
 * Por qué centralizar queries:
 *   1. Evita copiar/pegar SQL entre servicios (DRY)
 *   2. Facilita optimización: un cambio aquí afecta todos los consumidores
 *   3. Permite auditar todas las queries del módulo en un solo archivo
 *   4. Los parámetros están documentados con su posición
 *
 * Convención: cada query documenta sus parámetros $1, $2...
 * Las queries usan CTEs nombradas para legibilidad en queries complejas.
 */

/**
 * reports.queries.ts — SINGLE SOURCE OF TRUTH para queries SQL del módulo reportes.
 * Agrega: SQL_DOCENTES_DEL_DIA (agrupado por docente, no por bloque)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTO / METADATA
// ─────────────────────────────────────────────────────────────────────────────

/** $1: seccion_id */
export const SQL_SECCION_INFO = `
  SELECT
    s.id,
    s.nombre,
    g.nombre                                          AS grado,
    g.orden                                           AS grado_orden,
    d.nombre || ' ' || d.apellido_paterno             AS tutor_nombre,
    s.tutor_id,
    s.capacidad,
    COUNT(m.id) FILTER (WHERE m.activo = true)::int   AS total_matriculados
  FROM secciones s
  JOIN grados g ON g.id = s.grado_id
  LEFT JOIN docentes d ON d.id = s.tutor_id
  LEFT JOIN matriculas m ON m.seccion_id = s.id
  WHERE s.id = $1
  GROUP BY s.id, s.nombre, g.nombre, g.orden, d.nombre, d.apellido_paterno, s.tutor_id, s.capacidad
`;

// ─────────────────────────────────────────────────────────────────────────────
// NOTAS
// ─────────────────────────────────────────────────────────────────────────────

/** $1: alumno_id  $2: periodo_id */
export const SQL_LIBRETA_ALUMNO = `
  SELECT
    c.id                                        AS curso_id,
    c.nombre                                    AS curso,
    d.nombre || ' ' || d.apellido_paterno       AS docente,
    COUNT(n.id)::int                            AS total_notas,
    ROUND(AVG(n.nota)::numeric, 2)              AS promedio,
    MIN(n.nota)                                 AS nota_min,
    MAX(n.nota)                                 AS nota_max
  FROM matriculas m
  JOIN cursos      c ON c.seccion_id = m.seccion_id
                    AND c.periodo_id = (
                        SELECT id FROM periodos WHERE activo = TRUE LIMIT 1
                    )
                    AND c.activo = true
  LEFT JOIN docentes d ON d.id = c.docente_id
  LEFT JOIN notas    n ON n.alumno_id = m.alumno_id
                      AND n.curso_id  = c.id
                      AND n.periodo_id = c.periodo_id
                      AND n.nota IS NOT NULL
  WHERE m.alumno_id = $1
    AND m.anio = $2
    AND m.activo = true
  GROUP BY c.id, c.nombre, d.nombre, d.apellido_paterno
  ORDER BY c.nombre ASC
`;

/** $1: curso_id  $2: periodo_id */
export const SQL_CUADRO_NOTAS = `
  SELECT
    a.id                                AS alumno_id,
    cu.numero_documento                 AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre                            AS alumno_nombre,
    n.id                                AS nota_id,
    n.titulo                            AS actividad,
    n.tipo,
    n.nota,
    n.fecha
  FROM matriculas m
  JOIN cursos     c  ON c.id = $1 AND c.periodo_id = $2
                     AND c.seccion_id = m.seccion_id
  JOIN alumnos    a  ON a.id = m.alumno_id
  JOIN cuentas    cu ON cu.id = a.id
  LEFT JOIN notas n  ON n.alumno_id = a.id
                    AND n.curso_id  = c.id
                    AND n.periodo_id = c.periodo_id
  WHERE m.anio = EXTRACT(YEAR FROM (SELECT fecha_inicio FROM periodos WHERE id = $2))
    AND m.activo = true
  ORDER BY a.apellido_paterno, a.nombre, n.fecha NULLS LAST, n.titulo
`;

/** $1: curso_id  $2: periodo_id */
export const SQL_PROMEDIOS_CURSO = `
  SELECT
    a.id                                          AS alumno_id,
    cu.numero_documento                           AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre,
    COUNT(n.id)::int                              AS notas_registradas,
    ROUND(AVG(n.nota)::numeric, 2)                AS promedio,
    CASE
      WHEN AVG(n.nota) IS NULL  THEN 'Sin notas'
      WHEN AVG(n.nota) >= 18    THEN 'AD'
      WHEN AVG(n.nota) >= 14    THEN 'A'
      WHEN AVG(n.nota) >= 11    THEN 'B'
      ELSE                           'C'
    END                                           AS escala
  FROM matriculas m
  JOIN cursos     c  ON c.id = $1 AND c.periodo_id = $2
                     AND c.seccion_id = m.seccion_id
  JOIN alumnos    a  ON a.id = m.alumno_id
  JOIN cuentas    cu ON cu.id = a.id
  LEFT JOIN notas n  ON n.alumno_id = a.id
                    AND n.curso_id  = c.id
                    AND n.periodo_id = c.periodo_id
                    AND n.nota IS NOT NULL
  WHERE m.anio = EXTRACT(YEAR FROM (SELECT fecha_inicio FROM periodos WHERE id = $2))
    AND m.activo = true
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
  ORDER BY promedio DESC NULLS LAST, a.apellido_paterno, a.nombre
`;

/** $1: seccion_id  $2: periodo_id  $3: umbral */
export const SQL_TOP_Y_RIESGO = `
  WITH avg_por_curso AS (
    SELECT
      a.id            AS alumno_id,
      c.id            AS curso_id,
      AVG(n.nota)     AS promedio_curso
    FROM matriculas m
    JOIN alumnos    a ON a.id = m.alumno_id
    JOIN cursos     c ON c.seccion_id = m.seccion_id
                     AND c.periodo_id = $2
                     AND c.activo = true
    LEFT JOIN notas n ON n.alumno_id = a.id
                     AND n.curso_id  = c.id
                     AND n.periodo_id = $2
                     AND n.nota IS NOT NULL
    WHERE m.seccion_id = $1
      AND m.anio = EXTRACT(YEAR FROM (SELECT fecha_inicio FROM periodos WHERE id = $2))
      AND m.activo = true
    GROUP BY a.id, c.id
  )
  SELECT
    a.id                                                            AS alumno_id,
    cu.numero_documento                                             AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre,
    ROUND(AVG(apc.promedio_curso)::numeric, 2)                      AS promedio_general,
    COUNT(*) FILTER (WHERE apc.promedio_curso < $3)::int            AS cursos_en_riesgo,
    CASE
      WHEN AVG(apc.promedio_curso) IS NULL    THEN 'sin-datos'
      WHEN AVG(apc.promedio_curso) < $3       THEN 'riesgo'
      WHEN AVG(apc.promedio_curso) >= 18      THEN 'top'
      ELSE                                         'normal'
    END                                                             AS categoria
  FROM avg_por_curso apc
  JOIN alumnos a  ON a.id = apc.alumno_id
  JOIN cuentas cu ON cu.id = a.id
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
  ORDER BY promedio_general DESC NULLS LAST
`;

/** $1: seccion_id  $2: periodo_id */
export const SQL_SECCION_NOTAS = `
  SELECT
    a.id                                        AS alumno_id,
    cu.numero_documento                         AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre,
    c.id                                        AS curso_id,
    c.nombre                                    AS curso,
    COUNT(n.id) FILTER (WHERE n.nota IS NOT NULL)::int  AS total_notas,
    ROUND(AVG(n.nota)::numeric, 2)              AS promedio,
    CASE
      WHEN AVG(n.nota) IS NULL  THEN 'Sin notas'
      WHEN AVG(n.nota) >= 18    THEN 'AD'
      WHEN AVG(n.nota) >= 14    THEN 'A'
      WHEN AVG(n.nota) >= 11    THEN 'B'
      ELSE                           'C'
    END                                         AS escala
  FROM matriculas m
  JOIN alumnos    a  ON a.id = m.alumno_id
  JOIN cuentas    cu ON cu.id = a.id
  JOIN cursos     c  ON c.seccion_id = m.seccion_id
                    AND c.periodo_id = $2
                    AND c.activo = true
  LEFT JOIN notas n  ON n.alumno_id = a.id
                    AND n.curso_id  = c.id
                    AND n.periodo_id = $2
  WHERE m.seccion_id = $1
    AND m.anio = EXTRACT(YEAR FROM (SELECT fecha_inicio FROM periodos WHERE id = $2))
    AND m.activo = true
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre,
           c.id, c.nombre
  ORDER BY a.apellido_paterno, a.nombre, c.nombre
`;

// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA ALUMNOS
// ─────────────────────────────────────────────────────────────────────────────

/** $1: seccion_id  $2: fecha */
export const SQL_ASISTENCIA_DIARIA_ALUMNOS = `
  SELECT
    a.id                                AS alumno_id,
    cu.numero_documento                 AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre,
    COALESCE(ag.estado, 'sin-registro') AS estado,
    ag.observacion,
    ag.fecha
  FROM matriculas m
  JOIN alumnos    a  ON a.id = m.alumno_id
  JOIN cuentas    cu ON cu.id = a.id
  LEFT JOIN asistencias_generales ag
         ON ag.alumno_id  = a.id
        AND ag.seccion_id = m.seccion_id
        AND ag.fecha      = $2::date
  WHERE m.seccion_id = $1
    AND m.activo = true
    AND m.anio = EXTRACT(YEAR FROM $2::date)
  ORDER BY a.apellido_paterno, a.nombre
`;

/** $1: seccion_id  $2: periodo_id */
export const SQL_RESUMEN_ASISTENCIA = `
  SELECT
    a.id                                                          AS alumno_id,
    cu.numero_documento                                           AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre,
    COUNT(ag.id)::int                                             AS dias_registrados,
    COUNT(*) FILTER (WHERE ag.estado = 'asistio')::int            AS asistencias,
    COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int           AS tardanzas,
    COUNT(*) FILTER (WHERE ag.estado = 'falta')::int              AS faltas,
    COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int        AS justificadas,
    CASE WHEN COUNT(ag.id) = 0 THEN NULL ELSE
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE ag.estado IN ('asistio','tardanza'))
              / COUNT(ag.id), 2
      )
    END                                                           AS porcentaje_asistencia
  FROM matriculas m
  JOIN alumnos    a  ON a.id = m.alumno_id
  JOIN cuentas    cu ON cu.id = a.id
  LEFT JOIN asistencias_generales ag
         ON ag.alumno_id  = a.id
        AND ag.seccion_id = m.seccion_id
        AND ag.periodo_id = $2
  WHERE m.seccion_id = $1
    AND m.anio = EXTRACT(YEAR FROM (SELECT fecha_inicio FROM periodos WHERE id = $2))
    AND m.activo = true
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
  ORDER BY porcentaje_asistencia ASC NULLS LAST, a.apellido_paterno, a.nombre
`;

/** $1: seccion_id  $2: periodo_id  $3: limit */
export const SQL_TOP_INASISTENTES = `
  SELECT
    a.id                                                          AS alumno_id,
    cu.numero_documento                                           AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre,
    COUNT(*) FILTER (WHERE ag.estado = 'falta')::int              AS faltas,
    COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int           AS tardanzas,
    COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int        AS justificadas
  FROM matriculas m
  JOIN alumnos    a  ON a.id = m.alumno_id
  JOIN cuentas    cu ON cu.id = a.id
  LEFT JOIN asistencias_generales ag
         ON ag.alumno_id  = a.id
        AND ag.seccion_id = m.seccion_id
        AND ag.periodo_id = $2
  WHERE m.seccion_id = $1
    AND m.anio = EXTRACT(YEAR FROM (SELECT fecha_inicio FROM periodos WHERE id = $2))
    AND m.activo = true
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
  HAVING COUNT(*) FILTER (WHERE ag.estado = 'falta') > 0
  ORDER BY faltas DESC, tardanzas DESC, a.apellido_paterno
  LIMIT $3
`;

// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA DOCENTES — QUERIES EXISTENTES (sin cambios)
// ─────────────────────────────────────────────────────────────────────────────

export const SQL_HORARIOS_DEL_DIA = `
  SELECT
    h.id                                              AS horario_id,
    c.id                                              AS curso_id,
    c.nombre                                          AS curso_nombre,
    s.nombre                                          AS seccion_nombre,
    g.nombre                                          AS grado_nombre,
    d.id                                              AS docente_id,
    d.nombre || ' ' || d.apellido_paterno             AS docente_nombre,
    h.dia_semana,
    h.hora_inicio,
    h.hora_fin,
    h.aula,
    ad.id                                             AS asistencia_id,
    ad.estado                                         AS estado_actual,
    ad.hora_llegada,
    ad.tiene_justificacion,
    ad.motivo_justificacion,
    ad.hubo_reemplazo,
    ad.observacion
  FROM horarios h
  JOIN cursos    c  ON c.id = h.curso_id AND c.activo = true
  JOIN secciones s  ON s.id = c.seccion_id AND s.activo = true
  JOIN grados    g  ON g.id = s.grado_id
  JOIN docentes  d  ON d.id = c.docente_id
  LEFT JOIN asistencias_docente ad
         ON ad.horario_id = h.id
        AND ad.fecha      = $1::date
  WHERE h.dia_semana = TO_CHAR($1::date, 'day')::varchar
  ORDER BY g.orden, s.nombre, h.hora_inicio
`;

export const SQL_HORARIOS_DEL_DIA_V2 = `
  WITH dia_es AS (
    SELECT CASE EXTRACT(DOW FROM $1::date)
      WHEN 1 THEN 'lunes'
      WHEN 2 THEN 'martes'
      WHEN 3 THEN 'miercoles'
      WHEN 4 THEN 'jueves'
      WHEN 5 THEN 'viernes'
    END AS nombre_dia
  )
  SELECT
    h.id                                              AS horario_id,
    c.id                                              AS curso_id,
    c.nombre                                          AS curso_nombre,
    s.nombre                                          AS seccion_nombre,
    g.nombre                                          AS grado_nombre,
    g.orden                                           AS grado_orden,
    d.id                                              AS docente_id,
    d.nombre || ' ' || d.apellido_paterno             AS docente_nombre,
    h.dia_semana,
    h.hora_inicio::text,
    h.hora_fin::text,
    h.aula,
    ad.id                                             AS asistencia_id,
    COALESCE(ad.estado, 'sin-registro')               AS estado_actual,
    ad.hora_llegada::text,
    COALESCE(ad.tiene_justificacion, false)           AS tiene_justificacion,
    ad.motivo_justificacion,
    COALESCE(ad.hubo_reemplazo, false)                AS hubo_reemplazo,
    ad.observacion,
    ad.hora_salida_anticipada::text
  FROM horarios h
  JOIN cursos    c  ON c.id = h.curso_id AND c.activo = true
  JOIN secciones s  ON s.id = c.seccion_id AND s.activo = true
  JOIN grados    g  ON g.id = s.grado_id
  JOIN docentes  d  ON d.id = c.docente_id
  LEFT JOIN asistencias_docente ad
         ON ad.horario_id = h.id
        AND ad.fecha      = $1::date
  WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  ORDER BY g.orden, s.nombre, h.hora_inicio
`;

// ─────────────────────────────────────────────────────────────────────────────
// NUEVA QUERY — Docentes del día agrupados (para la nueva UI)
// $1: fecha (DATE string)
// Devuelve 1 fila por docente con su primera/última clase y estado actual
// ─────────────────────────────────────────────────────────────────────────────

export const SQL_DOCENTES_DEL_DIA = `
  WITH dia_es AS (
    SELECT CASE EXTRACT(DOW FROM $1::date)
      WHEN 1 THEN 'lunes'
      WHEN 2 THEN 'martes'
      WHEN 3 THEN 'miercoles'
      WHEN 4 THEN 'jueves'
      WHEN 5 THEN 'viernes'
    END AS nombre_dia
  ),
  -- Todos los bloques del día para cada docente
  bloques AS (
    SELECT
      d.id                                    AS docente_id,
      d.nombre                                AS docente_nombre,
      d.apellido_paterno,
      d.apellido_materno,
      h.id                                    AS horario_id,
      h.hora_inicio,
      h.hora_fin,
      h.aula,
      c.nombre                                AS curso_nombre,
      s.nombre                                AS seccion_nombre,
      g.nombre                                AS grado_nombre,
      g.orden                                 AS grado_orden,
      -- Estado ya registrado para este bloque hoy (si existe)
      ad.estado                               AS estado_bloque,
      ad.hora_llegada,
      ad.hora_salida_anticipada,
      ad.motivo_justificacion                 AS motivo
    FROM horarios h
    JOIN cursos    c ON c.id = h.curso_id AND c.activo = true
    JOIN secciones s ON s.id = c.seccion_id AND s.activo = true
    JOIN grados    g ON g.id = s.grado_id
    JOIN docentes  d ON d.id = c.docente_id
    JOIN cuentas   cu ON cu.id = d.id AND cu.activo = true
    LEFT JOIN asistencias_docente ad
           ON ad.horario_id = h.id
          AND ad.fecha      = $1::date
    WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  ),
  -- Agrupa por docente: primera clase, última clase, estado del día
  docentes_agg AS (
    SELECT
      docente_id,
      docente_nombre,
      apellido_paterno,
      apellido_materno,
      MIN(hora_inicio)::text                  AS primera_clase,
      MAX(hora_fin)::text                     AS ultima_clase,
      COUNT(*)::int                           AS total_bloques,
      -- Estado del día: si todos los bloques tienen el mismo estado, ese es el estado
      -- Si hay mezcla (salida anticipada), usamos el primero no-presente
      (
        SELECT b2.estado_bloque
        FROM bloques b2
        WHERE b2.docente_id = bloques.docente_id
          AND b2.estado_bloque IS NOT NULL
          AND b2.estado_bloque <> 'presente'
        ORDER BY b2.hora_inicio
        LIMIT 1
      )                                       AS estado_especial,
      -- Si todos son presente o null → presente
      CASE
        WHEN bool_and(estado_bloque IS NULL) THEN NULL  -- sin registro
        WHEN bool_and(estado_bloque = 'presente') THEN 'presente'
        ELSE NULL  -- estado_especial lo maneja
      END                                     AS estado_uniforme,
      -- Hora llegada del primer bloque
      (
        SELECT b2.hora_llegada::text
        FROM bloques b2
        WHERE b2.docente_id = bloques.docente_id
          AND b2.hora_llegada IS NOT NULL
        ORDER BY b2.hora_inicio
        LIMIT 1
      )                                       AS hora_llegada,
      -- Hora salida anticipada
      (
        SELECT b2.hora_salida_anticipada::text
        FROM bloques b2
        WHERE b2.docente_id = bloques.docente_id
          AND b2.hora_salida_anticipada IS NOT NULL
        ORDER BY b2.hora_inicio DESC
        LIMIT 1
      )                                       AS hora_salida_anticipada,
      -- Motivo
      (
        SELECT b2.motivo
        FROM bloques b2
        WHERE b2.docente_id = bloques.docente_id
          AND b2.motivo IS NOT NULL
        ORDER BY b2.hora_inicio
        LIMIT 1
      )                                       AS motivo,
      -- Lista de bloques como JSON para referencia
      json_agg(
        json_build_object(
          'horario_id',   horario_id,
          'hora_inicio',  hora_inicio::text,
          'hora_fin',     hora_fin::text,
          'aula',         aula,
          'curso_nombre', curso_nombre,
          'seccion_nombre', seccion_nombre,
          'estado_bloque', estado_bloque
        ) ORDER BY hora_inicio
      )                                       AS bloques_json,
      MAX(grado_orden)                        AS grado_orden_max
    FROM bloques
    GROUP BY docente_id, docente_nombre, apellido_paterno, apellido_materno
  )
  SELECT
    docente_id,
    docente_nombre,
    apellido_paterno,
    apellido_materno,
    primera_clase,
    ultima_clase,
    total_bloques,
    -- Estado final del día
    COALESCE(estado_especial, estado_uniforme) AS estado_actual,
    hora_llegada,
    hora_salida_anticipada,
    motivo,
    bloques_json,
    -- Ya fue registrado si al menos un bloque tiene estado
    (estado_especial IS NOT NULL OR estado_uniforme IS NOT NULL) AS ya_registrado
  FROM docentes_agg
  ORDER BY apellido_paterno, docente_nombre
`;

export const SQL_REPORTE_DIARIO_DOCENTES = `
  WITH dia_es AS (
    SELECT CASE EXTRACT(DOW FROM $1::date)
      WHEN 1 THEN 'lunes'
      WHEN 2 THEN 'martes'
      WHEN 3 THEN 'miercoles'
      WHEN 4 THEN 'jueves'
      WHEN 5 THEN 'viernes'
    END AS nombre_dia
  )
  SELECT
    ad.id                                             AS asistencia_id,
    h.id                                              AS horario_id,
    d.id                                              AS docente_id,
    d.nombre                                          AS docente_nombre,
    d.apellido_paterno,
    d.apellido_materno,
    c.nombre                                          AS curso_nombre,
    s.nombre                                          AS seccion_nombre,
    g.nombre                                          AS grado_nombre,
    h.hora_inicio::text,
    h.hora_fin::text,
    h.aula,
    COALESCE(ad.estado, 'sin-registro')               AS estado,
    ad.hora_llegada::text,
    ad.hora_salida_anticipada::text,
    COALESCE(ad.tiene_justificacion, false)           AS tiene_justificacion,
    ad.motivo_justificacion,
    COALESCE(ad.hubo_reemplazo, false)                AS hubo_reemplazo,
    ad.observacion
  FROM horarios h
  JOIN cursos    c  ON c.id = h.curso_id AND c.activo = true
  JOIN secciones s  ON s.id = c.seccion_id AND s.activo = true
  JOIN grados    g  ON g.id = s.grado_id
  JOIN docentes  d  ON d.id = c.docente_id
  LEFT JOIN asistencias_docente ad
         ON ad.horario_id = h.id
        AND ad.fecha      = $1::date
  WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  ORDER BY g.orden, s.nombre, h.hora_inicio
`;

export const SQL_RESUMEN_DOCENTES_RANGO = `
  WITH
  dias AS (
    SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS fecha
  ),
  bloques_esperados AS (
    SELECT
      h.id          AS horario_id,
      c.docente_id,
      d.fecha
    FROM horarios h
    JOIN cursos c ON c.id = h.curso_id AND c.activo = true
    JOIN dias   d ON CASE EXTRACT(DOW FROM d.fecha)
                       WHEN 1 THEN 'lunes'
                       WHEN 2 THEN 'martes'
                       WHEN 3 THEN 'miercoles'
                       WHEN 4 THEN 'jueves'
                       WHEN 5 THEN 'viernes'
                     END = h.dia_semana
    WHERE c.docente_id IS NOT NULL
  ),
  stats AS (
    SELECT
      be.docente_id,
      COUNT(*)                                                            AS total_esperados,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'presente')::int            AS presentes,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'tardanza')::int            AS tardanzas,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'ausente')::int             AS ausentes,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'permiso')::int             AS permisos,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'licencia')::int            AS licencias,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'salida_anticipada')::int   AS salidas_anticipadas,
      COUNT(*) FILTER (WHERE ad.id IS NULL)::int                         AS sin_registro,
      COUNT(ad.id) FILTER (
        WHERE ad.estado = 'ausente' AND ad.tiene_justificacion = false
      )::int                                                              AS ausentes_sin_justificacion
    FROM bloques_esperados be
    LEFT JOIN asistencias_docente ad
           ON ad.horario_id = be.horario_id
          AND ad.fecha      = be.fecha
    GROUP BY be.docente_id
  )
  SELECT
    d.id                                                                  AS docente_id,
    d.nombre                                                              AS docente_nombre,
    d.apellido_paterno,
    d.apellido_materno,
    s.total_esperados                                                     AS total_bloques_esperados,
    s.presentes,
    s.tardanzas,
    s.ausentes,
    s.permisos,
    s.licencias,
    s.salidas_anticipadas,
    s.sin_registro,
    s.ausentes_sin_justificacion,
    CASE WHEN s.total_esperados = 0 THEN NULL ELSE
      ROUND(100.0 * (s.presentes + s.tardanzas + s.salidas_anticipadas) / s.total_esperados, 2)
    END                                                                   AS porcentaje_asistencia
  FROM stats s
  JOIN docentes d ON d.id = s.docente_id
  ORDER BY s.ausentes DESC, s.ausentes_sin_justificacion DESC, d.apellido_paterno
`;

export const SQL_ALERTAS_AUSENCIAS_DOCENTE = `
  SELECT
    d.id                                                    AS docente_id,
    d.nombre                                                AS docente_nombre,
    d.apellido_paterno,
    d.apellido_materno,
    COUNT(*) FILTER (WHERE ad.estado IN ('ausente','permiso','licencia'))::int
                                                            AS total_ausencias,
    COUNT(*) FILTER (
      WHERE ad.estado = 'ausente' AND ad.tiene_justificacion = false
    )::int                                                  AS sin_justificacion,
    COUNT(*) FILTER (
      WHERE ad.estado IN ('ausente','permiso','licencia') AND ad.hubo_reemplazo = false
    )::int                                                  AS clases_sin_cobertura,
    MAX(ad.fecha)::text                                     AS ultima_ausencia
  FROM asistencias_docente ad
  JOIN docentes d ON d.id = ad.docente_id
  WHERE ad.fecha BETWEEN $1::date AND $2::date
  GROUP BY d.id, d.nombre, d.apellido_paterno, d.apellido_materno
  HAVING COUNT(*) FILTER (WHERE ad.estado = 'ausente') > 0
  ORDER BY sin_justificacion DESC, total_ausencias DESC
  LIMIT $3
`;

export const SQL_ENTREGAS_POR_TAREA = `
  WITH alumnos_seccion AS (
    SELECT COUNT(*)::int AS total
    FROM matriculas
    WHERE seccion_id = $1
      AND anio = EXTRACT(YEAR FROM (SELECT fecha_inicio FROM periodos WHERE id = $2))
      AND activo = true
  )
  SELECT
    t.id                                                              AS tarea_id,
    t.titulo,
    t.fecha_limite,
    t.bimestre,
    t.semana,
    (SELECT total FROM alumnos_seccion)                               AS total_alumnos,
    COUNT(et.id)::int                                                 AS entregaron,
    (SELECT total FROM alumnos_seccion) - COUNT(et.id)::int           AS pendientes,
    COUNT(et.id) FILTER (WHERE et.con_retraso = true)::int            AS con_retraso,
    COUNT(et.id) FILTER (WHERE et.calificacion_final IS NOT NULL)::int AS calificadas,
    ROUND(AVG(et.calificacion_final)::numeric, 2)                     AS promedio_calificacion,
    CASE WHEN (SELECT total FROM alumnos_seccion) = 0 THEN NULL ELSE
      ROUND(100.0 * COUNT(et.id) / (SELECT total FROM alumnos_seccion), 2)
    END                                                               AS porcentaje_entrega
  FROM tareas t
  JOIN cursos c ON c.id = t.curso_id
                AND c.seccion_id = $1
                AND c.periodo_id = $2
                AND c.activo = true
  LEFT JOIN entregas_tarea et ON et.tarea_id = t.id
  WHERE t.activo = true
  GROUP BY t.id, t.titulo, t.fecha_limite, t.bimestre, t.semana
  ORDER BY t.fecha_limite ASC
`;

export const SQL_ENTREGAS_POR_ALUMNO = `
  SELECT
    a.id                              AS alumno_id,
    cu.numero_documento               AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre,
    t.id                              AS tarea_id,
    t.titulo                          AS tarea_titulo,
    t.fecha_limite,
    (et.id IS NOT NULL)               AS entrego,
    COALESCE(et.con_retraso, false)   AS con_retraso,
    et.calificacion_final,
    et.fecha_entrega
  FROM matriculas m
  JOIN alumnos    a  ON a.id = m.alumno_id
  JOIN cuentas    cu ON cu.id = a.id
  JOIN cursos     c  ON c.seccion_id = m.seccion_id
                    AND c.periodo_id = $2
                    AND c.activo = true
  JOIN tareas     t  ON t.curso_id = c.id AND t.activo = true
  LEFT JOIN entregas_tarea et
         ON et.tarea_id  = t.id
        AND et.alumno_id = a.id
  WHERE m.seccion_id = $1
    AND m.anio = EXTRACT(YEAR FROM (SELECT fecha_inicio FROM periodos WHERE id = $2))
    AND m.activo = true
  ORDER BY a.apellido_paterno, a.nombre, t.fecha_limite
`;