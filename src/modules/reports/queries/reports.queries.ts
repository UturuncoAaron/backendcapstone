// ============================================================================
// EDUAULA SUITE DE CONSULTAS SQL — MODULE: REPORTS (`reports.queries.ts`)
// UNIFICADO CON TABLA ÚNICA: asistencias_personal
// ============================================================================

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
  bloques_hoy AS (
    SELECT
      c.docente_id,
      h.id AS horario_id,
      h.hora_inicio,
      h.hora_fin,
      h.aula,
      cc.nombre AS curso_nombre,
      s.nombre AS seccion_nombre
    FROM horarios h
    JOIN cursos c ON c.id = h.curso_id AND c.activo = true
    JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
    JOIN secciones s ON s.id = c.seccion_id AND s.activo = true
    WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  )
  SELECT
    d.id AS docente_id,
    CONCAT(d.apellido_paterno, ' ', COALESCE(d.apellido_materno, ''), ', ', d.nombre) AS docente_nombre,
    MIN(bh.hora_inicio)::text AS primera_clase,
    MAX(bh.hora_fin)::text AS ultima_clase,
    COUNT(bh.horario_id)::int AS total_bloques,
    COALESCE(aj.estado, 'sin-registro') AS estado_actual,
    aj.hora_entrada::text AS hora_llegada,
    aj.hora_salida::text,
    aj.motivo_justificacion AS motivo,
    (aj.id IS NOT NULL) AS ya_registrado,
    COALESCE(
      json_agg(
        json_build_object(
          'horario_id', bh.horario_id,
          'hora_inicio', bh.hora_inicio::text,
          'hora_fin', bh.hora_fin::text,
          'aula', bh.aula,
          'curso_nombre', bh.curso_nombre,
          'seccion_nombre', bh.seccion_nombre,
          'estado_bloque', COALESCE(aj.estado, 'sin-registro'),
          'hora_salida', aj.hora_salida::text
        ) ORDER BY bh.hora_inicio
      ) FILTER (WHERE bh.horario_id IS NOT NULL), '[]'::json
    ) AS bloques_json
  FROM docentes d
  JOIN cuentas cu ON cu.id = d.id AND cu.activo = true
  JOIN bloques_hoy bh ON bh.docente_id = d.id
  LEFT JOIN asistencias_personal aj ON aj.cuenta_id = d.id AND aj.fecha = $1::date
  GROUP BY d.id, d.nombre, d.apellido_paterno, d.apellido_materno, aj.id, aj.estado, aj.hora_entrada, aj.hora_salida, aj.motivo_justificacion
  ORDER BY d.apellido_paterno, d.nombre;
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
    h.id                                                                               AS horario_id,
    c.id                                                                               AS curso_id,
    cc.nombre                                                                          AS curso_nombre,
    s.nombre                                                                           AS seccion_nombre,
    g.nombre                                                                           AS grado_nombre,
    g.orden                                                                            AS grado_orden,
    d.id                                                                               AS docente_id,
    CONCAT(d.apellido_paterno, ' ', COALESCE(d.apellido_materno, ''), ', ', d.nombre) AS docente_nombre,
    h.dia_semana,
    h.hora_inicio::text,
    h.hora_fin::text,
    h.aula,
    ap.id                                                                              AS asistencia_id,
    COALESCE(ap.estado, 'sin-registro')                                                AS estado_actual,
    ap.hora_entrada::text                                                              AS hora_llegada,
    ap.hora_salida::text,
    ap.motivo_justificacion,
    false                                                                              AS hubo_reemplazo,
    ap.observacion
  FROM horarios h
  JOIN cursos           c  ON c.id = h.curso_id AND c.activo = true
  JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
  JOIN secciones        s  ON s.id = c.seccion_id AND s.activo = true
  JOIN grados           g  ON g.id = s.grado_id
  JOIN docentes         d  ON d.id = c.docente_id
  LEFT JOIN asistencias_personal ap
         ON ap.cuenta_id = d.id
        AND ap.fecha     = $1::date
  WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  ORDER BY g.orden, s.nombre, h.hora_inicio;
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
  ),
  bloques_hoy AS (
    SELECT
      c.docente_id,
      h.id AS horario_id,
      h.hora_inicio,
      h.hora_fin,
      h.aula,
      cc.nombre AS curso_nombre,
      s.nombre AS seccion_nombre,
      g.nombre AS grado_nombre
    FROM horarios h
    JOIN cursos c ON c.id = h.curso_id AND c.activo = true
    JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
    JOIN secciones s ON s.id = c.seccion_id AND s.activo = true
    JOIN grados g ON g.id = s.grado_id
    WHERE h.dia_semana = (SELECT nombre_dia FROM dia_es)
  )
  SELECT
    MAX(aj.id::text)                                                                   AS asistencia_id,
    MAX(bh.horario_id::text)                                                           AS horario_id,
    d.id                                                                               AS docente_id,
    CONCAT(d.apellido_paterno, ' ', COALESCE(d.apellido_materno, ''), ', ', d.nombre) AS docente_nombre,
    string_agg(DISTINCT CASE 
      WHEN bh.grado_nombre ~ '^\\d+' THEN SUBSTRING(bh.grado_nombre FROM '^\\d+') || '°'
      ELSE bh.grado_nombre 
    END, ', ')                                                                         AS grado_nombre,
    string_agg(DISTINCT bh.seccion_nombre, ', ')                                       AS seccion_nombre,
    string_agg(DISTINCT bh.curso_nombre, ', ')                                         AS curso_nombre,
    MIN(bh.hora_inicio)::text || ' - ' || MAX(bh.hora_fin)::text                       AS hora_inicio, 
    ''                                                                                 AS hora_fin,
    string_agg(DISTINCT COALESCE(bh.aula, '—'), ', ')                                  AS aula,
    COALESCE(aj.estado, 'sin-registro')                                                AS estado,
    aj.hora_entrada::text                                                              AS hora_llegada,
    aj.hora_salida::text                                                               AS hora_salida,
    aj.motivo_justificacion,
    false                                                                              AS hubo_reemplazo,
    string_agg(DISTINCT aj.observacion, ' | ')                                         AS observacion
  FROM docentes d
  JOIN cuentas cu ON cu.id = d.id AND cu.activo = true
  JOIN bloques_hoy bh ON bh.docente_id = d.id
  LEFT JOIN asistencias_personal aj ON aj.cuenta_id = d.id AND aj.fecha = $1::date
  WHERE cu.activo = true
  GROUP BY d.id, d.nombre, d.apellido_paterno, d.apellido_materno, aj.id, aj.estado, aj.hora_entrada, aj.hora_salida, aj.motivo_justificacion
  ORDER BY d.apellido_paterno, d.nombre;
`;

export const SQL_RESUMEN_DOCENTES_RANGO = `
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
  ),
  docentes_con_clases AS (
    SELECT DISTINCT c.docente_id, dl.fecha
    FROM horarios h
    JOIN cursos c ON c.id = h.curso_id AND c.activo = true
    JOIN dias_laborables dl ON dl.dia_semana = h.dia_semana
  ),
  stats AS (
    SELECT
      dc.docente_id,
      COUNT(*)::int AS total_esperados,
      COUNT(aj.id) FILTER (WHERE aj.estado = 'presente')::int   AS presentes,
      COUNT(aj.id) FILTER (WHERE aj.estado = 'tardanza')::int   AS tardanzas,
      COUNT(aj.id) FILTER (WHERE aj.estado = 'falto')::int      AS faltos,
      COUNT(aj.id) FILTER (WHERE aj.estado = 'justificado')::int AS justificados,
      COUNT(*) FILTER (WHERE aj.id IS NULL)::int                        AS sin_registro
    FROM docentes_con_clases dc
    LEFT JOIN asistencias_personal aj 
           ON aj.cuenta_id = dc.docente_id 
          AND aj.fecha = dc.fecha
    GROUP BY dc.docente_id
  )
  SELECT
    d.id                                                                               AS docente_id,
    CONCAT(d.apellido_paterno, ' ', COALESCE(d.apellido_materno, ''), ', ', d.nombre) AS docente_nombre,
    s.total_esperados                                                                  AS total_bloques_esperados,
    s.presentes,
    s.tardanzas,
    s.faltos,
    s.justificados,
    s.sin_registro,
    0 AS faltos_sin_justificacion,
    CASE WHEN s.total_esperados = 0 THEN NULL ELSE
      ROUND(100.0 * (s.presentes + s.tardanzas) / s.total_esperados, 2)
    END                                                                                AS porcentaje_asistencia
  FROM stats s
  JOIN docentes d ON d.id = s.docente_id
  ORDER BY s.faltos DESC, d.apellido_paterno;
`;

export const SQL_ALERTAS_AUSENCIAS_DOCENTE = `
  SELECT
    d.id                                                                               AS docente_id,
    CONCAT(d.apellido_paterno, ' ', COALESCE(d.apellido_materno, ''), ', ', d.nombre) AS docente_nombre,
    COUNT(*) FILTER (WHERE ap.estado IN ('falto','justificado'))::int                  AS total_ausencias,
    COUNT(*) FILTER (
      WHERE ap.estado = 'falto'
        AND (ap.motivo_justificacion IS NULL OR trim(ap.motivo_justificacion) = '')
    )::int                                                                             AS sin_justificacion,
    COUNT(*) FILTER (
      WHERE ap.estado IN ('falto','justificado') AND ap.hora_salida IS NULL
    )::int                                                                             AS clases_sin_cobertura,
    MAX(ap.fecha)::text                                                                AS ultima_ausencia
  FROM asistencias_personal ap
  JOIN docentes d ON d.id = ap.cuenta_id
  WHERE ap.fecha BETWEEN $1::date AND $2::date
  GROUP BY d.id, d.nombre, d.apellido_paterno, d.apellido_materno
  HAVING COUNT(*) FILTER (WHERE ap.estado = 'falto') > 0
  ORDER BY sin_justificacion DESC, total_ausencias DESC
  LIMIT $3;
`;

export const SQL_ASISTENCIA_DIARIA_ALUMNOS = `
  SELECT
    a.id                                AS alumno_id,
    cu.numero_documento                 AS dni,
    CONCAT(a.apellido_paterno, ' ', COALESCE(a.apellido_materno, ''), ', ', a.nombre) AS alumno_nombre,
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
  ORDER BY a.apellido_paterno, a.nombre;
`;

export const SQL_RESUMEN_ASISTENCIA = `
  SELECT
    a.id                                                                                          AS alumno_id,
    cu.numero_documento                                                                           AS dni,
    CONCAT(a.apellido_paterno, ' ', COALESCE(a.apellido_materno, ''), ', ', a.nombre) AS alumno_nombre,
    COUNT(ag.id)::int                                                                             AS dias_registrados,
    COUNT(*) FILTER (WHERE ag.estado = 'asistio')::int                                            AS asistencias,
    COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int                                           AS tardanzas,
    COUNT(*) FILTER (WHERE ag.estado = 'falta')::int                                              AS faltas,
    COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int                                        AS justificadas,
    CASE WHEN COUNT(ag.id) = 0 THEN NULL ELSE
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE ag.estado IN ('asistio','tardanza'))
              / COUNT(ag.id), 2
      )
    END                                                                                           AS porcentaje_asistencia
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
  ORDER BY porcentaje_asistencia ASC NULLS LAST, a.apellido_paterno, a.nombre;
`;

export const SQL_TOP_INASISTENTES = `
  SELECT
    a.id                                                                                          AS alumno_id,
    cu.numero_documento                                                                           AS dni,
    CONCAT(a.apellido_paterno, ' ', COALESCE(a.apellido_materno, ''), ', ', a.nombre) AS alumno_nombre,
    COUNT(*) FILTER (WHERE ag.estado = 'falta')::int                                              AS faltas,
    COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int                                           AS tardanzas,
    COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int                                        AS justificadas
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
  LIMIT $3;
`;

export const SQL_TOP_Y_RIESGO = `
  WITH avg_por_curso AS (
    SELECT
      a.id            AS alumno_id,
      c.id            AS curso_id,
      AVG(n.nota)     AS promedio_curso
    FROM matriculas m
    JOIN alumnos    a ON a.id = m.alumno_id
    JOIN cursos      c ON c.seccion_id = m.seccion_id
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
    a.id                                                                                            AS alumno_id,
    cu.numero_documento                                                                             AS dni,
    CONCAT(a.apellido_paterno, ' ', COALESCE(a.apellido_materno, ''), ', ', a.nombre) AS alumno_nombre,
    ROUND(AVG(apc.promedio_curso)::numeric, 2)                                                      AS promedio_general,
    COUNT(*) FILTER (WHERE apc.promedio_curso < $3)::int                                            AS cursos_en_riesgo,
    CASE
      WHEN AVG(apc.promedio_curso) IS NULL THEN 'sin-datos'
      WHEN AVG(apc.promedio_curso) < $3    THEN 'riesgo'
      WHEN AVG(apc.promedio_curso) >= 18   THEN 'top'
      ELSE                                                                                             'normal'
    END                                                                                             AS categoria
  FROM avg_por_curso apc
  JOIN alumnos a  ON a.id = apc.alumno_id
  JOIN cuentas cu ON cu.id = a.id
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
  ORDER BY promedio_general DESC NULLS LAST;
`;

export const SQL_SECCION_INFO = `
  SELECT
    s.id,
    s.nombre,
    g.nombre                                                              AS grado,
    g.orden                                                               AS grado_orden,
    s.capacidad,
    COUNT(m.id) FILTER (WHERE m.activo = true)::int                       AS total_matriculados,
    st.docente_id                                                         AS tutor_id,
    CONCAT(d.apellido_paterno, ', ', d.nombre)                            AS tutor_nombre
  FROM secciones s
  JOIN grados g ON g.id = s.grado_id
  LEFT JOIN secciones_tutores st
         ON st.seccion_id = s.id
        AND st.anio = (SELECT anio FROM anios_lectivos WHERE estado = 'en_curso' LIMIT 1)
        AND st.activo = true
  LEFT JOIN docentes d ON d.id = st.docente_id
  LEFT JOIN matriculas m ON m.seccion_id = s.id
  WHERE s.id = $1
  GROUP BY s.id, s.nombre, g.nombre, g.orden, s.capacidad, st.docente_id, d.nombre, d.apellido_paterno;
`;

export const SQL_SECCION_NOTAS = `
  SELECT
    a.id                                                                                          AS alumno_id,
    cu.numero_documento                                                                           AS dni,
    CONCAT(a.apellido_paterno, ' ', COALESCE(a.apellido_materno, ''), ', ', a.nombre) AS alumno_nombre,
    cc.id                                                                                         AS catalogo_id,
    cc.nombre                                                                                     AS curso,
    c.id                                                                                          AS curso_id,
    COUNT(n.id) FILTER (WHERE n.nota IS NOT NULL)::int                                            AS total_notas,
    ROUND(AVG(n.nota)::numeric, 2)                                                                AS promedio,
    CASE
      WHEN AVG(n.nota) IS NULL THEN 'Sin notas'
      WHEN AVG(n.nota) >= 18   THEN 'AD'
      WHEN AVG(n.nota) >= 14   THEN 'A'
      WHEN AVG(n.nota) >= 11   THEN 'B'
      ELSE                                                                                             'C'
    END                                                                                           AS escala
  FROM matriculas m
  JOIN alumnos         a  ON a.id = m.alumno_id
  JOIN cuentas         cu ON cu.id = a.id
  JOIN cursos          c  ON c.seccion_id = m.seccion_id
                          AND c.anio = m.anio
                          AND c.activo = true
  JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
  LEFT JOIN notas      n  ON n.alumno_id = a.id
                          AND n.curso_id   = c.id
                          AND n.periodo_id = $2
  WHERE m.seccion_id = $1
    AND m.anio = (SELECT anio FROM periodos WHERE id = $2)
    AND m.activo = true
  GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno,
           a.nombre, cc.id, cc.nombre, c.id
  ORDER BY a.apellido_paterno, a.nombre, cc.nombre;
`;

export const SQL_RESUMEN_STAFF_RANGO = `
  WITH dias AS (
    SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS fecha
  ),
  dias_laborables AS (
    SELECT d.fecha FROM dias d
    WHERE EXTRACT(DOW FROM d.fecha) BETWEEN 1 AND 5
  ),
  universo_staff AS (
    SELECT s.id AS staff_id, s.cargo, c.nombre, c.apellido_paterno, c.apellido_materno, dl.fecha
    FROM staff s
    JOIN cuentas c ON c.id = s.id AND c.activo = true
    CROSS JOIN dias_laborables dl
  ),
  stats_staff AS (
    SELECT
      us.staff_id,
      us.cargo,
      us.nombre,
      us.apellido_paterno,
      us.apellido_materno,
      COUNT(*)::int AS total_esperados,
      COUNT(ap.id) FILTER (WHERE ap.estado = 'presente')::int AS presentes,
      COUNT(ap.id) FILTER (WHERE ap.estado = 'tardanza')::int AS tardanzas,
      COUNT(ap.id) FILTER (WHERE ap.estado = 'falto')::int AS faltos,
      COUNT(ap.id) FILTER (WHERE ap.estado = 'justificado')::int AS justificados
    FROM universo_staff us
    LEFT JOIN asistencias_personal ap 
           ON ap.cuenta_id = us.staff_id 
          AND ap.fecha = us.fecha
    GROUP BY us.staff_id, us.cargo, us.nombre, us.apellido_paterno, us.apellido_materno
  )
  SELECT 
    staff_id,
    cargo,
    CONCAT(apellido_paterno, ' ', COALESCE(apellido_materno, ''), ', ', nombre) AS staff_nombre,
    total_esperados,
    presentes,
    tardanzas,
    faltos,
    justificados,
    CASE WHEN total_esperados = 0 THEN NULL ELSE
      ROUND(100.0 * (presentes + tardanzas) / total_esperados, 2)
    END AS porcentaje_asistencia
  FROM stats_staff
  ORDER BY cargo ASC, apellido_paterno ASC;
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
    t.id                                                                                              AS tarea_id,
    t.titulo,
    t.fecha_limite,
    t.bimestre,
    t.semana,
    (SELECT total FROM alumnos_seccion)                                                               AS total_alumnos,
    COUNT(et.id)::int                                                                                 AS entregaron,
    (SELECT total FROM alumnos_seccion) - COUNT(et.id)::int                                           AS pendientes,
    COUNT(et.id) FILTER (WHERE et.con_retraso = true)::int                                            AS con_retraso,
    COUNT(et.id) FILTER (WHERE et.calificacion_final IS NOT NULL)::int                                AS calificadas,
    ROUND(AVG(et.calificacion_final)::numeric, 2)                                                     AS promedio_calificacion,
    CASE WHEN (SELECT total FROM alumnos_seccion) = 0 THEN NULL ELSE
      ROUND(100.0 * COUNT(et.id) / (SELECT total FROM alumnos_seccion), 2)
    END                                                                                               AS porcentaje_entrega
  FROM tareas t
  JOIN cursos c ON c.id = t.curso_id
                AND c.seccion_id = $1
                AND c.anio = (SELECT anio FROM periodos WHERE id = $2)
                AND c.activo = true
  LEFT JOIN entregas_tarea et ON et.tarea_id = t.id
  WHERE t.activo = true
  GROUP BY t.id, t.titulo, t.fecha_limite, t.bimestre, t.semana
  ORDER BY t.fecha_limite ASC;
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
    dl.fecha::text                                                                     AS fecha,
    d.id                                                                               AS docente_id,
    CONCAT(d.apellido_paterno, ' ', COALESCE(d.apellido_materno, ''), ', ', d.nombre) AS docente_nombre,
    cc.nombre                                                                          AS curso_nombre,
    s.nombre                                                                           AS seccion_nombre,
    g.nombre                                                                           AS grado_nombre,
    g.orden                                                                            AS grado_orden,
    h.hora_inicio::text,
    h.hora_fin::text,
    COALESCE(ap.estado, 'sin-registro')                                                AS estado,
    ap.hora_entrada::text                                                              AS hora_llegada,
    ap.hora_salida::text,
    ap.motivo_justificacion
  FROM dias_laborables dl
  JOIN horarios        h  ON h.dia_semana = dl.dia_semana
  JOIN cursos          c  ON c.id = h.curso_id AND c.activo = true
  JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
  JOIN secciones       s  ON s.id = c.seccion_id AND s.activo = true
  JOIN grados          g  ON g.id = s.grado_id
  JOIN docentes        d  ON d.id = c.docente_id
  JOIN cuentas         cu ON cu.id = d.id AND cu.activo = true
  LEFT JOIN asistencias_personal ap
         ON ap.cuenta_id = d.id
        AND ap.fecha     = dl.fecha
  ORDER BY dl.fecha, g.orden, s.nombre, d.apellido_paterno, h.hora_inicio;
`;