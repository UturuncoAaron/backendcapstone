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
      cc.nombre                               AS curso_nombre,
      s.nombre                                AS seccion_nombre,
      g.nombre                                AS grado_nombre,
      g.orden                                 AS grado_orden,
      ad.estado                               AS estado_bloque,
      ad.hora_llegada,
      ad.hora_salida,
      ad.motivo_justificacion                 AS motivo
    FROM horarios h
    JOIN cursos           c  ON c.id = h.curso_id AND c.activo = true
    JOIN cursos_catalogo  cc ON cc.id = c.catalogo_id
    JOIN secciones        s  ON s.id = c.seccion_id AND s.activo = true
    JOIN grados           g  ON g.id = s.grado_id
    JOIN docentes         d  ON d.id = c.docente_id
    JOIN cuentas          cu ON cu.id = d.id AND cu.activo = true
    LEFT JOIN asistencias_docente ad
           ON ad.horario_id = h.id
          AND ad.fecha      = $1::date
    WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  ),
  docentes_agg AS (
    SELECT
      docente_id,
      docente_nombre,
      apellido_paterno,
      apellido_materno,
      MIN(hora_inicio)::text                  AS primera_clase,
      MAX(hora_fin)::text                     AS ultima_clase,
      COUNT(*)::int                           AS total_bloques,
      (
        SELECT b2.estado_bloque
        FROM bloques b2
        WHERE b2.docente_id = bloques.docente_id
          AND b2.estado_bloque IS NOT NULL
          AND b2.estado_bloque NOT IN ('presente','tardanza')
        ORDER BY b2.hora_inicio
        LIMIT 1
      )                                       AS estado_especial,
      CASE
        WHEN bool_and(estado_bloque IS NULL)           THEN NULL
        WHEN bool_and(estado_bloque = 'presente')      THEN 'presente'
        WHEN bool_and(estado_bloque = 'tardanza')      THEN 'tardanza'
        ELSE NULL
      END                                     AS estado_uniforme,
      (
        SELECT b2.hora_llegada::text
        FROM bloques b2
        WHERE b2.docente_id = bloques.docente_id
          AND b2.hora_llegada IS NOT NULL
        ORDER BY b2.hora_inicio
        LIMIT 1
      )                                       AS hora_llegada,
      (
        SELECT b2.hora_salida::text
        FROM bloques b2
        WHERE b2.docente_id = bloques.docente_id
          AND b2.hora_salida IS NOT NULL
        ORDER BY b2.hora_inicio DESC
        LIMIT 1
      )                                       AS hora_salida,
      (
        SELECT b2.motivo
        FROM bloques b2
        WHERE b2.docente_id = bloques.docente_id
          AND b2.motivo IS NOT NULL
        ORDER BY b2.hora_inicio
        LIMIT 1
      )                                       AS motivo,
      json_agg(
        json_build_object(
          'horario_id',     horario_id,
          'hora_inicio',    hora_inicio::text,
          'hora_fin',       hora_fin::text,
          'aula',           aula,
          'curso_nombre',   curso_nombre,
          'seccion_nombre', seccion_nombre,
          'estado_bloque',  estado_bloque,
          'hora_salida',    hora_salida::text
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
    COALESCE(estado_especial, estado_uniforme) AS estado_actual,
    hora_llegada,
    hora_salida,
    motivo,
    bloques_json,
    (estado_especial IS NOT NULL OR estado_uniforme IS NOT NULL) AS ya_registrado
  FROM docentes_agg
  ORDER BY apellido_paterno, docente_nombre
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
    cc.nombre                                         AS curso_nombre,
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
    ad.hora_salida::text,
    ad.motivo_justificacion,
    COALESCE(ad.hubo_reemplazo, false)                AS hubo_reemplazo,
    ad.observacion
  FROM horarios h
  JOIN cursos          c  ON c.id = h.curso_id AND c.activo = true
  JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
  JOIN secciones       s  ON s.id = c.seccion_id AND s.activo = true
  JOIN grados          g  ON g.id = s.grado_id
  JOIN docentes        d  ON d.id = c.docente_id
  LEFT JOIN asistencias_docente ad
         ON ad.horario_id = h.id
        AND ad.fecha      = $1::date
  WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  ORDER BY g.orden, s.nombre, h.hora_inicio
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
    cc.nombre                                         AS curso_nombre,
    s.nombre                                          AS seccion_nombre,
    g.nombre                                          AS grado_nombre,
    h.hora_inicio::text,
    h.hora_fin::text,
    h.aula,
    COALESCE(ad.estado, 'sin-registro')               AS estado,
    ad.hora_llegada::text,
    ad.hora_salida::text,
    ad.motivo_justificacion,
    COALESCE(ad.hubo_reemplazo, false)                AS hubo_reemplazo,
    ad.observacion
  FROM horarios h
  JOIN cursos          c  ON c.id = h.curso_id AND c.activo = true
  JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
  JOIN secciones       s  ON s.id = c.seccion_id AND s.activo = true
  JOIN grados          g  ON g.id = s.grado_id
  JOIN docentes        d  ON d.id = c.docente_id
  LEFT JOIN asistencias_docente ad
         ON ad.horario_id = h.id
        AND ad.fecha      = $1::date
  WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  ORDER BY g.orden, s.nombre, h.hora_inicio
`;

export const SQL_RESUMEN_DOCENTES_RANGO = `
  WITH dias AS (
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
      COUNT(*)                                                          AS total_esperados,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'presente')::int          AS presentes,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'tardanza')::int          AS tardanzas,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'falto')::int             AS faltos,
      COUNT(ad.id) FILTER (WHERE ad.estado = 'justificado')::int       AS justificados,
      COUNT(*) FILTER (WHERE ad.id IS NULL)::int                       AS sin_registro,
      COUNT(ad.id) FILTER (
        WHERE ad.estado = 'falto' AND (ad.motivo_justificacion IS NULL OR trim(ad.motivo_justificacion) = '')
      )::int                                                            AS faltos_sin_justificacion
    FROM bloques_esperados be
    LEFT JOIN asistencias_docente ad
           ON ad.horario_id = be.horario_id
          AND ad.fecha      = be.fecha
    GROUP BY be.docente_id
  )
  SELECT
    d.id                                                                AS docente_id,
    d.nombre                                                            AS docente_nombre,
    d.apellido_paterno,
    d.apellido_materno,
    s.total_esperados                                                   AS total_bloques_esperados,
    s.presentes,
    s.tardanzas,
    s.faltos,
    s.justificados,
    s.sin_registro,
    s.faltos_sin_justificacion,
    CASE WHEN s.total_esperados = 0 THEN NULL ELSE
      ROUND(100.0 * (s.presentes + s.tardanzas) / s.total_esperados, 2)
    END                                                                 AS porcentaje_asistencia
  FROM stats s
  JOIN docentes d ON d.id = s.docente_id
  ORDER BY s.faltos DESC, s.faltos_sin_justificacion DESC, d.apellido_paterno
`;

export const SQL_ALERTAS_AUSENCIAS_DOCENTE = `
  SELECT
    d.id                                                    AS docente_id,
    d.nombre                                                AS docente_nombre,
    d.apellido_paterno,
    d.apellido_materno,
    COUNT(*) FILTER (WHERE ad.estado IN ('falto','justificado'))::int
                                                            AS total_ausencias,
    COUNT(*) FILTER (
      WHERE ad.estado = 'falto'
        AND (ad.motivo_justificacion IS NULL OR trim(ad.motivo_justificacion) = '')
    )::int                                                  AS sin_justificacion,
    COUNT(*) FILTER (
      WHERE ad.estado IN ('falto','justificado') AND ad.hubo_reemplazo = false
    )::int                                                  AS clases_sin_cobertura,
    MAX(ad.fecha)::text                                     AS ultima_ausencia
  FROM asistencias_docente ad
  JOIN docentes d ON d.id = ad.docente_id
  WHERE ad.fecha BETWEEN $1::date AND $2::date
  GROUP BY d.id, d.nombre, d.apellido_paterno, d.apellido_materno
  HAVING COUNT(*) FILTER (WHERE ad.estado = 'falto') > 0
  ORDER BY sin_justificacion DESC, total_ausencias DESC
  LIMIT $3
`;

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
    AND m.anio = (SELECT anio FROM periodos WHERE id = $2)
    AND m.activo = true
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
  ORDER BY porcentaje_asistencia ASC NULLS LAST, a.apellido_paterno, a.nombre
`;

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
    AND m.anio = (SELECT anio FROM periodos WHERE id = $2)
    AND m.activo = true
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
  HAVING COUNT(*) FILTER (WHERE ag.estado = 'falta') > 0
  ORDER BY faltas DESC, tardanzas DESC, a.apellido_paterno
  LIMIT $3
`;

export const SQL_TOP_Y_RIESGO = `
  WITH avg_por_curso AS (
    SELECT
      a.id            AS alumno_id,
      c.id            AS curso_id,
      AVG(n.nota)     AS promedio_curso
    FROM matriculas m
    JOIN alumnos    a ON a.id = m.alumno_id
    JOIN cursos     c ON c.seccion_id = m.seccion_id
                     AND c.anio = m.anio
                     AND c.activo = true
    LEFT JOIN notas n ON n.alumno_id = a.id
                     AND n.curso_id  = c.id
                     AND n.periodo_id = $2
                     AND n.nota IS NOT NULL
    WHERE m.seccion_id = $1
      AND m.anio = (SELECT anio FROM periodos WHERE id = $2)
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
      WHEN AVG(apc.promedio_curso) IS NULL THEN 'sin-datos'
      WHEN AVG(apc.promedio_curso) < $3    THEN 'riesgo'
      WHEN AVG(apc.promedio_curso) >= 18   THEN 'top'
      ELSE                                      'normal'
    END                                                             AS categoria
  FROM avg_por_curso apc
  JOIN alumnos a  ON a.id = apc.alumno_id
  JOIN cuentas cu ON cu.id = a.id
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
  ORDER BY promedio_general DESC NULLS LAST
`;

export const SQL_ENTREGAS_POR_TAREA = `
  WITH alumnos_seccion AS (
    SELECT COUNT(*)::int AS total
    FROM matriculas
    WHERE seccion_id = $1
      AND anio = (SELECT anio FROM periodos WHERE id = $2)
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
                AND c.anio = (SELECT anio FROM periodos WHERE id = $2)
                AND c.activo = true
  LEFT JOIN entregas_tarea et ON et.tarea_id = t.id
  WHERE t.activo = true
  GROUP BY t.id, t.titulo, t.fecha_limite, t.bimestre, t.semana
  ORDER BY t.fecha_limite ASC
`;

export const SQL_SECCION_INFO = `
  SELECT
    s.id,
    s.nombre,
    g.nombre                                              AS grado,
    g.orden                                               AS grado_orden,
    s.capacidad,
    COUNT(m.id) FILTER (WHERE m.activo = true)::int       AS total_matriculados,
    st.docente_id                                         AS tutor_id,
    d.nombre || ' ' || d.apellido_paterno                 AS tutor_nombre
  FROM secciones s
  JOIN grados g ON g.id = s.grado_id
  LEFT JOIN secciones_tutores st
         ON st.seccion_id = s.id
        AND st.anio = (SELECT anio FROM anios_lectivos WHERE estado = 'en_curso' LIMIT 1)
        AND st.activo = true
  LEFT JOIN docentes d ON d.id = st.docente_id
  LEFT JOIN matriculas m ON m.seccion_id = s.id
  WHERE s.id = $1
  GROUP BY s.id, s.nombre, g.nombre, g.orden, s.capacidad, st.docente_id, d.nombre, d.apellido_paterno
`;

export const SQL_SECCION_NOTAS = `
  SELECT
    a.id                                                          AS alumno_id,
    cu.numero_documento                                           AS dni,
    a.apellido_paterno,
    a.apellido_materno,
    a.nombre,
    cc.id                                                         AS catalogo_id,
    cc.nombre                                                     AS curso,
    c.id                                                          AS curso_id,
    COUNT(n.id) FILTER (WHERE n.nota IS NOT NULL)::int            AS total_notas,
    ROUND(AVG(n.nota)::numeric, 2)                                AS promedio,
    CASE
      WHEN AVG(n.nota) IS NULL THEN 'Sin notas'
      WHEN AVG(n.nota) >= 18   THEN 'AD'
      WHEN AVG(n.nota) >= 14   THEN 'A'
      WHEN AVG(n.nota) >= 11   THEN 'B'
      ELSE                          'C'
    END                                                           AS escala
  FROM matriculas m
  JOIN alumnos         a  ON a.id = m.alumno_id
  JOIN cuentas         cu ON cu.id = a.id
  JOIN cursos          c  ON c.seccion_id = m.seccion_id
                         AND c.anio = m.anio
                         AND c.activo = true
  JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
  LEFT JOIN notas      n  ON n.alumno_id = a.id
                         AND n.curso_id  = c.id
                         AND n.periodo_id = $2
  WHERE m.seccion_id = $1
    AND m.anio = (SELECT anio FROM periodos WHERE id = $2)
    AND m.activo = true
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno,
           a.nombre, cc.id, cc.nombre, c.id
  ORDER BY a.apellido_paterno, a.nombre, cc.nombre
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
                    AND c.anio = m.anio
                    AND c.activo = true
  JOIN tareas     t  ON t.curso_id = c.id AND t.activo = true
  LEFT JOIN entregas_tarea et
         ON et.tarea_id  = t.id
        AND et.alumno_id = a.id
  WHERE m.seccion_id = $1
    AND m.anio = (SELECT anio FROM periodos WHERE id = $2)
    AND m.activo = true
  ORDER BY a.apellido_paterno, a.nombre, t.fecha_limite
`;

export const SQL_REPORTE_RANGO_DOCENTES = `
  WITH dias AS (
    SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS fecha
  ),
  dias_laborables AS (
    SELECT
      d.fecha,
      CASE EXTRACT(DOW FROM d.fecha)
        WHEN 1 THEN 'lunes'
        WHEN 2 THEN 'martes'
        WHEN 3 THEN 'miercoles'
        WHEN 4 THEN 'jueves'
        WHEN 5 THEN 'viernes'
      END AS dia_semana
    FROM dias d
    WHERE EXTRACT(DOW FROM d.fecha) BETWEEN 1 AND 5
  )
  SELECT
    dl.fecha::text                                            AS fecha,
    d.id                                                      AS docente_id,
    d.nombre                                                  AS docente_nombre,
    d.apellido_paterno,
    d.apellido_materno,
    cc.nombre                                                 AS curso_nombre,
    s.nombre                                                  AS seccion_nombre,
    g.nombre                                                  AS grado_nombre,
    g.orden                                                   AS grado_orden,
    h.hora_inicio::text,
    h.hora_fin::text,
    COALESCE(ad.estado, 'sin-registro')                       AS estado,
    ad.hora_llegada::text,
    ad.hora_salida::text,
    ad.motivo_justificacion
  FROM dias_laborables dl
  JOIN horarios        h  ON h.dia_semana = dl.dia_semana
  JOIN cursos          c  ON c.id = h.curso_id AND c.activo = true
  JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
  JOIN secciones       s  ON s.id = c.seccion_id AND s.activo = true
  JOIN grados          g  ON g.id = s.grado_id
  JOIN docentes        d  ON d.id = c.docente_id
  JOIN cuentas         cu ON cu.id = d.id AND cu.activo = true
  LEFT JOIN asistencias_docente ad
         ON ad.horario_id = h.id
        AND ad.fecha      = dl.fecha
  ORDER BY dl.fecha, g.orden, s.nombre, d.apellido_paterno, h.hora_inicio
`;