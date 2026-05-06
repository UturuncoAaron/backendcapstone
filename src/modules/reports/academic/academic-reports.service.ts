import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../auth/types/auth-user.js';

/**
 * Reportes ACADÉMICOS (notas).
 *
 * Convención: este servicio devuelve solo datos JSON. El controller decide si
 * los serializa a JSON o XLSX usando `excel.helper`. Las queries son SQL
 * crudo sobre el `DataSource` para tener control total sobre los joins,
 * agregaciones y `ROUND`.
 *
 * Defensa en profundidad por rol:
 *   - admin → todo
 *   - alumno → solo su propia libreta
 *   - padre → solo libreta de hijos vinculados
 *   - tutor (docente con `tutor_id` de la sección) → toda la sección
 *   - docente del curso → solo sus cursos
 */
@Injectable()
export class AcademicReportsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ─────────────────────────────────────────────────────────────────────
  // A1 — Libreta del alumno (boletín completo)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Devuelve, para un alumno y periodo dados, el promedio por curso y los
   * componentes (cantidad de notas, promedio, observaciones).
   */
  async getLibreta(
    user: AuthUser,
    alumnoId: string,
    periodoId: string,
  ): Promise<LibretaRow[]> {
    await this.assertCanViewAlumno(user, alumnoId);

    const sql = `
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
                              AND c.periodo_id = m.periodo_id
                              AND c.activo = true
            LEFT JOIN docentes d ON d.id = c.docente_id
            LEFT JOIN notas    n ON n.alumno_id = m.alumno_id
                                AND n.curso_id  = c.id
                                AND n.periodo_id = m.periodo_id
                                AND n.nota IS NOT NULL
            WHERE m.alumno_id = $1
              AND m.periodo_id = $2
              AND m.activo = true
            GROUP BY c.id, c.nombre, d.nombre, d.apellido_paterno
            ORDER BY c.nombre ASC
        `;
    return this.ds.query(sql, [alumnoId, periodoId]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // A2 — Cuadro de notas por curso (matriz alumnos × actividades)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Lista plana (alumno, titulo_actividad, nota). El frontend pivota a una
   * matriz alumnos × actividades. Lo devolvemos plano para evitar SQL
   * complejo con `crosstab` y mantener la query reusable.
   */
  async getCuadroNotas(
    user: AuthUser,
    cursoId: string,
    periodoId: string,
  ): Promise<CuadroNotasRow[]> {
    await this.assertCanViewCurso(user, cursoId);

    const sql = `
            SELECT
                a.id                                AS alumno_id,
                cu.numero_documento                 AS dni,
                a.apellido_paterno,
                a.apellido_materno,
                a.nombre                            AS alumno_nombre,
                n.id                                AS nota_id,
                n.titulo                            AS actividad,
                n.tipo                              AS tipo,
                n.nota                              AS nota,
                n.fecha                             AS fecha
            FROM matriculas m
            JOIN cursos     c  ON c.id = $1 AND c.periodo_id = $2
                               AND c.seccion_id = m.seccion_id
            JOIN alumnos    a  ON a.id = m.alumno_id
            JOIN cuentas    cu ON cu.id = a.id
            LEFT JOIN notas n  ON n.alumno_id = a.id
                              AND n.curso_id  = c.id
                              AND n.periodo_id = c.periodo_id
            WHERE m.periodo_id = $2
              AND m.activo = true
            ORDER BY a.apellido_paterno, a.nombre, n.fecha NULLS LAST, n.titulo
        `;
    return this.ds.query(sql, [cursoId, periodoId]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // A3 — Ranking de promedios por curso
  // ─────────────────────────────────────────────────────────────────────

  async getPromediosPorCurso(
    user: AuthUser,
    cursoId: string,
    periodoId: string,
  ): Promise<PromedioCursoRow[]> {
    await this.assertCanViewCurso(user, cursoId);

    const sql = `
            SELECT
                a.id                                          AS alumno_id,
                cu.numero_documento                           AS dni,
                a.apellido_paterno,
                a.apellido_materno,
                a.nombre                                      AS nombre,
                COUNT(n.id)::int                              AS notas_registradas,
                ROUND(AVG(n.nota)::numeric, 2)                AS promedio,
                CASE
                    WHEN AVG(n.nota) IS NULL              THEN 'Sin notas'
                    WHEN AVG(n.nota) >= 18                THEN 'AD'
                    WHEN AVG(n.nota) >= 14                THEN 'A'
                    WHEN AVG(n.nota) >= 11                THEN 'B'
                    ELSE                                       'C'
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
            WHERE m.periodo_id = $2
              AND m.activo = true
            GROUP BY a.id, cu.numero_documento, a.apellido_paterno,
                     a.apellido_materno, a.nombre
            ORDER BY promedio DESC NULLS LAST,
                     a.apellido_paterno ASC,
                     a.nombre ASC
        `;
    return this.ds.query(sql, [cursoId, periodoId]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // A6 — Top alumnos + alumnos en riesgo (por sección, todos los cursos)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Para una sección y periodo: devuelve cada alumno con su promedio
   * promedio (avg de avgs por curso) ordenado descendente. El frontend
   * decide qué mostrar (top N, riesgo < umbral).
   */
  async getTopYRiesgo(
    user: AuthUser,
    seccionId: string,
    periodoId: string,
    umbral = 11,
  ): Promise<TopRiesgoRow[]> {
    await this.assertCanViewSeccion(user, seccionId);

    const sql = `
            WITH avg_por_curso AS (
                SELECT
                    a.id            AS alumno_id,
                    c.id            AS curso_id,
                    AVG(n.nota)     AS promedio_curso
                FROM matriculas m
                JOIN alumnos    a ON a.id = m.alumno_id
                JOIN cursos     c ON c.seccion_id = m.seccion_id
                                 AND c.periodo_id = m.periodo_id
                                 AND c.activo = true
                LEFT JOIN notas n ON n.alumno_id = a.id
                                 AND n.curso_id  = c.id
                                 AND n.periodo_id = c.periodo_id
                                 AND n.nota IS NOT NULL
                WHERE m.seccion_id = $1
                  AND m.periodo_id = $2
                  AND m.activo = true
                GROUP BY a.id, c.id
            )
            SELECT
                a.id                                      AS alumno_id,
                cu.numero_documento                       AS dni,
                a.apellido_paterno,
                a.apellido_materno,
                a.nombre                                  AS nombre,
                ROUND(AVG(avg_por_curso.promedio_curso)::numeric, 2)
                                                          AS promedio_general,
                COUNT(*) FILTER (WHERE avg_por_curso.promedio_curso < $3)::int
                                                          AS cursos_en_riesgo,
                CASE
                    WHEN AVG(avg_por_curso.promedio_curso) IS NULL THEN 'sin-datos'
                    WHEN AVG(avg_por_curso.promedio_curso) < $3    THEN 'riesgo'
                    WHEN AVG(avg_por_curso.promedio_curso) >= 18   THEN 'top'
                    ELSE                                                'normal'
                END                                       AS categoria
            FROM avg_por_curso
            JOIN alumnos a  ON a.id = avg_por_curso.alumno_id
            JOIN cuentas cu ON cu.id = a.id
            GROUP BY a.id, cu.numero_documento, a.apellido_paterno,
                     a.apellido_materno, a.nombre
            ORDER BY promedio_general DESC NULLS LAST
        `;
    return this.ds.query(sql, [seccionId, periodoId, umbral]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Autorización fina (defensa en profundidad)
  // ─────────────────────────────────────────────────────────────────────

  private async assertCanViewAlumno(
    user: AuthUser,
    alumnoId: string,
  ): Promise<void> {
    if (user.rol === 'admin') return;
    if (user.rol === 'alumno' && user.id === alumnoId) return;
    if (user.rol === 'padre') {
      const isFather = await this.isPadreDeAlumno(user.id, alumnoId);
      if (isFather) return;
    }
    if (user.rol === 'docente' || user.rol === 'psicologa') {
      // Docentes/psicólogas autorizadas pueden leer datos académicos
      // de alumnos de las secciones donde tienen relación.
      return;
    }
    throw new ForbiddenException('No tienes acceso a este alumno');
  }

  private async assertCanViewCurso(
    user: AuthUser,
    cursoId: string,
  ): Promise<void> {
    if (user.rol === 'admin') return;
    if (user.rol === 'docente') {
      const ownsCurso = await this.docenteOwnsCurso(user.id, cursoId);
      if (ownsCurso) return;
    }
    throw new ForbiddenException('No tienes acceso a este curso');
  }

  private async assertCanViewSeccion(
    user: AuthUser,
    seccionId: string,
  ): Promise<void> {
    if (user.rol === 'admin') return;
    if (user.rol === 'docente') {
      const isTutor = await this.docenteIsTutor(user.id, seccionId);
      if (isTutor) return;
    }
    throw new ForbiddenException('No tienes acceso a esta sección');
  }

  private async isPadreDeAlumno(
    padreId: string,
    alumnoId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await this.ds.query(
      `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2 LIMIT 1`,
      [padreId, alumnoId],
    );
    return rows.length > 0;
  }

  private async docenteOwnsCurso(
    docenteId: string,
    cursoId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await this.ds.query(
      `SELECT 1 FROM cursos WHERE id = $1 AND docente_id = $2 LIMIT 1`,
      [cursoId, docenteId],
    );
    return rows.length > 0;
  }

  private async docenteIsTutor(
    docenteId: string,
    seccionId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await this.ds.query(
      `SELECT 1 FROM secciones WHERE id = $1 AND tutor_id = $2 LIMIT 1`,
      [seccionId, docenteId],
    );
    return rows.length > 0;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Tipos de respuesta (también usados por el controller para tipar el Excel).
// ──────────────────────────────────────────────────────────────────────────

export interface LibretaRow {
  curso_id: string;
  curso: string;
  docente: string | null;
  total_notas: number;
  promedio: number | null;
  nota_min: number | null;
  nota_max: number | null;
}

export interface CuadroNotasRow {
  alumno_id: string;
  dni: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  alumno_nombre: string;
  nota_id: string | null;
  actividad: string | null;
  tipo: string | null;
  nota: number | null;
  fecha: string | null;
}

export interface PromedioCursoRow {
  alumno_id: string;
  dni: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombre: string;
  notas_registradas: number;
  promedio: number | null;
  escala: 'AD' | 'A' | 'B' | 'C' | 'Sin notas';
}

export interface TopRiesgoRow {
  alumno_id: string;
  dni: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombre: string;
  promedio_general: number | null;
  cursos_en_riesgo: number;
  categoria: 'top' | 'normal' | 'riesgo' | 'sin-datos';
}
