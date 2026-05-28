import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../auth/types/auth-user.js';
import type { AsistenciaCursoExcelData } from './attendance-xlsx-builder.service.js';

@Injectable()
export class AttendanceReportsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) { }

  // ─────────────────────────────────────────────────────────────────────
  // B1 — Asistencia diaria por sección
  // ─────────────────────────────────────────────────────────────────────
  async getAsistenciaDiaria(user: AuthUser, seccionId: string, fecha: string) {
    await this.assertCanViewSeccion(user, seccionId);
    return this.ds.query(
      `SELECT
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
       JOIN periodos   p  ON p.anio = m.anio
                         AND p.fecha_inicio <= $2::date
                         AND p.fecha_fin    >= $2::date
       LEFT JOIN asistencias_generales ag
              ON ag.alumno_id = a.id
             AND ag.seccion_id = m.seccion_id
             AND ag.fecha = $2
       WHERE m.seccion_id = $1 AND m.activo = true
       ORDER BY a.apellido_paterno, a.nombre`,
      [seccionId, fecha],
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // B3 — Resumen de inasistencias
  // ─────────────────────────────────────────────────────────────────────
  async getResumenInasistencias(user: AuthUser, seccionId: string, periodoId: string) {
    await this.assertCanViewSeccion(user, seccionId);
    return this.ds.query(
      `SELECT
          a.id AS alumno_id,
          cu.numero_documento AS dni,
          a.apellido_paterno, a.apellido_materno, a.nombre,
          COUNT(ag.id)::int AS dias_registrados,
          COUNT(*) FILTER (WHERE ag.estado = 'asistio')::int  AS asistencias,
          COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int AS tardanzas,
          COUNT(*) FILTER (WHERE ag.estado = 'falta')::int    AS faltas,
          COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int AS justificadas,
          CASE WHEN COUNT(ag.id) = 0 THEN NULL ELSE
              ROUND(100.0 * COUNT(*) FILTER (WHERE ag.estado IN ('asistio','tardanza')) / COUNT(ag.id), 2)
          END AS porcentaje_asistencia
       FROM matriculas m
       JOIN periodos   p  ON p.id = $2 AND p.anio = m.anio
       JOIN alumnos    a  ON a.id = m.alumno_id
       JOIN cuentas    cu ON cu.id = a.id
       LEFT JOIN asistencias_generales ag
              ON ag.alumno_id  = a.id
             AND ag.seccion_id = m.seccion_id
             AND ag.periodo_id = $2
       WHERE m.seccion_id = $1 AND m.activo = true
       GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
       ORDER BY porcentaje_asistencia ASC NULLS LAST, a.apellido_paterno, a.nombre`,
      [seccionId, periodoId],
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // B4 — Top inasistentes
  // ─────────────────────────────────────────────────────────────────────
  async getTopInasistentes(user: AuthUser, seccionId: string, periodoId: string, limit = 10) {
    await this.assertCanViewSeccion(user, seccionId);
    return this.ds.query(
      `SELECT
          a.id AS alumno_id,
          cu.numero_documento AS dni,
          a.apellido_paterno, a.apellido_materno, a.nombre,
          COUNT(*) FILTER (WHERE ag.estado = 'falta')::int    AS faltas,
          COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int AS tardanzas,
          COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int AS justificadas
       FROM matriculas m
       JOIN periodos   p  ON p.id = $2 AND p.anio = m.anio
       JOIN alumnos    a  ON a.id = m.alumno_id
       JOIN cuentas    cu ON cu.id = a.id
       LEFT JOIN asistencias_generales ag
              ON ag.alumno_id  = a.id
             AND ag.seccion_id = m.seccion_id
             AND ag.periodo_id = $2
       WHERE m.seccion_id = $1 AND m.activo = true
       GROUP BY a.id, cu.numero_documento, a.apellido_paterno, a.apellido_materno, a.nombre
       HAVING COUNT(*) FILTER (WHERE ag.estado = 'falta') > 0
       ORDER BY faltas DESC, tardanzas DESC, a.apellido_paterno
       LIMIT $3`,
      [seccionId, periodoId, limit],
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // EXCEL DE ASISTENCIA POR CURSO (resumen + detalle con filtros)
  // ─────────────────────────────────────────────────────────────────────
  async getAsistenciaCursoExcel(
    user: AuthUser,
    cursoId: string,
    periodoId?: string,
    desde?: string,
    hasta?: string,
  ): Promise<AsistenciaCursoExcelData> {
    // Verificar acceso al curso
    if (user.rol === 'docente') {
      const rows = await this.ds.query<{ docente_id: string }[]>(
        `SELECT docente_id FROM cursos WHERE id = $1 AND activo = TRUE LIMIT 1`,
        [cursoId],
      );
      if (!rows[0] || rows[0].docente_id !== user.id) {
        throw new ForbiddenException('No tienes acceso a este curso');
      }
    }

    // Construir condiciones dinámicas
    const params: string[] = [cursoId];
    const conditions: string[] = ['ac.curso_id = $1'];

    if (periodoId) {
      params.push(periodoId);
      conditions.push(`ac.periodo_id = $${params.length}`);
    }
    if (desde) {
      params.push(desde);
      conditions.push(`ac.fecha >= $${params.length}::date`);
    }
    if (hasta) {
      params.push(hasta);
      conditions.push(`ac.fecha <= $${params.length}::date`);
    }
    const where = conditions.join(' AND ');

    // ── Datos del curso y periodo (para meta) ──
    const [metaRows, summaryRows, detalleRows] = await Promise.all([
      // Meta: nombre del curso + periodo
      this.ds.query<{ curso_nombre: string; periodo_nombre: string | null }[]>(
        `SELECT
            c.nombre AS curso_nombre,
            p.nombre AS periodo_nombre
         FROM cursos c
         LEFT JOIN periodos p ON p.id = $2
         WHERE c.id = $1
         LIMIT 1`,
        [cursoId, periodoId ?? null],
      ),

      // Resumen agregado por alumno
      this.ds.query<{
        apellido_paterno: string;
        apellido_materno: string | null;
        nombre: string;
        total: number;
        presente: number;
        tardanza: number;
        justificado: number;
        ausente: number;
        pct_asistencia: number;
      }[]>(
        `SELECT
            a.apellido_paterno,
            a.apellido_materno,
            a.nombre,
            COUNT(*)::int                                               AS total,
            COUNT(*) FILTER (WHERE ac.estado = 'asistio')::int         AS presente,
            COUNT(*) FILTER (WHERE ac.estado = 'tardanza')::int        AS tardanza,
            COUNT(*) FILTER (WHERE ac.estado = 'justificado')::int     AS justificado,
            COUNT(*) FILTER (WHERE ac.estado = 'falta')::int           AS ausente,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE ac.estado IN ('asistio','tardanza','justificado'))
                / NULLIF(COUNT(*), 0), 1
            )::float                                                    AS pct_asistencia
         FROM asistencias_curso ac
         JOIN alumnos a ON a.id = ac.alumno_id
         WHERE ${where}
         GROUP BY a.id, a.apellido_paterno, a.apellido_materno, a.nombre
         ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre`,
        params,
      ),

      // Detalle diario
      this.ds.query<{
        apellido_paterno: string;
        apellido_materno: string | null;
        nombre: string;
        fecha: string;
        estado: string;
        observacion: string | null;
      }[]>(
        `SELECT
            a.apellido_paterno,
            a.apellido_materno,
            a.nombre,
            ac.fecha::text AS fecha,
            ac.estado,
            ac.observacion
         FROM asistencias_curso ac
         JOIN alumnos a ON a.id = ac.alumno_id
         WHERE ${where}
         ORDER BY a.apellido_paterno, a.nombre, ac.fecha`,
        params,
      ),
    ]);

    const meta = metaRows[0];
    return {
      meta: {
        curso_nombre: meta?.curso_nombre ?? 'Curso',
        periodo_nombre: meta?.periodo_nombre ?? undefined,
        desde,
        hasta,
        generado_en: new Date().toISOString(),
      },
      summary: summaryRows,
      detalle: detalleRows,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Autorización
  // ─────────────────────────────────────────────────────────────────────
  private async assertCanViewSeccion(user: AuthUser, seccionId: string) {
    if (['admin', 'auxiliar', 'psicologa'].includes(user.rol)) return;
    if (user.rol === 'docente') {
      const isTutor = await this.docenteIsTutor(user.id, seccionId);
      if (isTutor) return;
    }
    throw new ForbiddenException('No tienes acceso a esta sección');
  }

  private async docenteIsTutor(docenteId: string, seccionId: string): Promise<boolean> {
    const rows: unknown[] = await this.ds.query(
      `SELECT 1 FROM secciones WHERE id = $1 AND tutor_id = $2 LIMIT 1`,
      [seccionId, docenteId],
    );
    return rows.length > 0;
  }
}

// ── Tipos exportados ─────────────────────────────────────────────────────────
export interface AsistenciaDiariaRow {
  alumno_id: string; dni: string;
  apellido_paterno: string; apellido_materno: string | null; nombre: string;
  estado: 'asistio' | 'falta' | 'tardanza' | 'justificado' | 'sin-registro';
  observacion: string | null; fecha: string | null;
}

export interface ResumenInasistenciaRow {
  alumno_id: string; dni: string;
  apellido_paterno: string; apellido_materno: string | null; nombre: string;
  dias_registrados: number; asistencias: number; tardanzas: number;
  faltas: number; justificadas: number; porcentaje_asistencia: number | null;
}

export interface TopInasistenteRow {
  alumno_id: string; dni: string;
  apellido_paterno: string; apellido_materno: string | null; nombre: string;
  faltas: number; tardanzas: number; justificadas: number;
}