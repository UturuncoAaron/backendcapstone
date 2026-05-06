import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../auth/types/auth-user.js';

/**
 * Reportes de ASISTENCIAS.
 *
 * Trabajamos sobre `asistencias_generales` (asistencia general del día por
 * sección). La asistencia por curso (`asistencias_clase`) queda fuera del
 * scope de esta primera fase.
 *
 * Roles autorizados:
 *   - admin → todo
 *   - tutor (docente designado tutor de la sección) → su(s) sección(es)
 *   - auxiliar → todas las secciones (escanea QR y consulta listas)
 *   - psicologa → lectura para fichas de seguimiento
 */
@Injectable()
export class AttendanceReportsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ─────────────────────────────────────────────────────────────────────
  // B1 — Asistencia diaria por sección
  // ─────────────────────────────────────────────────────────────────────

  async getAsistenciaDiaria(
    user: AuthUser,
    seccionId: string,
    fecha: string,
  ): Promise<AsistenciaDiariaRow[]> {
    await this.assertCanViewSeccion(user, seccionId);

    const sql = `
            SELECT
                a.id                                AS alumno_id,
                cu.numero_documento                 AS dni,
                a.apellido_paterno,
                a.apellido_materno,
                a.nombre                            AS nombre,
                COALESCE(ag.estado, 'sin-registro') AS estado,
                ag.observacion                      AS observacion,
                ag.fecha                            AS fecha
            FROM matriculas m
            JOIN alumnos    a  ON a.id = m.alumno_id
            JOIN cuentas    cu ON cu.id = a.id
            JOIN periodos   p  ON p.id = m.periodo_id
            LEFT JOIN asistencias_generales ag
                   ON ag.alumno_id = a.id
                  AND ag.seccion_id = m.seccion_id
                  AND ag.fecha = $2
            WHERE m.seccion_id = $1
              AND m.activo = true
              AND p.fecha_inicio <= $2::date
              AND p.fecha_fin    >= $2::date
            ORDER BY a.apellido_paterno, a.nombre
        `;
    return this.ds.query(sql, [seccionId, fecha]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // B3 — Resumen de inasistencias (% por alumno) en un periodo
  // ─────────────────────────────────────────────────────────────────────

  async getResumenInasistencias(
    user: AuthUser,
    seccionId: string,
    periodoId: string,
  ): Promise<ResumenInasistenciaRow[]> {
    await this.assertCanViewSeccion(user, seccionId);

    const sql = `
            SELECT
                a.id                                                AS alumno_id,
                cu.numero_documento                                 AS dni,
                a.apellido_paterno,
                a.apellido_materno,
                a.nombre                                            AS nombre,
                COUNT(ag.id)::int                                   AS dias_registrados,
                COUNT(*) FILTER (WHERE ag.estado = 'asistio')::int  AS asistencias,
                COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int AS tardanzas,
                COUNT(*) FILTER (WHERE ag.estado = 'falta')::int    AS faltas,
                COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int
                                                                    AS justificadas,
                CASE WHEN COUNT(ag.id) = 0 THEN NULL ELSE
                    ROUND(
                        100.0 * COUNT(*) FILTER (WHERE ag.estado IN ('asistio','tardanza'))
                              / COUNT(ag.id),
                        2
                    )
                END                                                 AS porcentaje_asistencia
            FROM matriculas m
            JOIN alumnos    a  ON a.id = m.alumno_id
            JOIN cuentas    cu ON cu.id = a.id
            LEFT JOIN asistencias_generales ag
                   ON ag.alumno_id  = a.id
                  AND ag.seccion_id = m.seccion_id
                  AND ag.periodo_id = m.periodo_id
            WHERE m.seccion_id = $1
              AND m.periodo_id = $2
              AND m.activo = true
            GROUP BY a.id, cu.numero_documento, a.apellido_paterno,
                     a.apellido_materno, a.nombre
            ORDER BY porcentaje_asistencia ASC NULLS LAST,
                     a.apellido_paterno, a.nombre
        `;
    return this.ds.query(sql, [seccionId, periodoId]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // B4 — Top inasistentes
  // ─────────────────────────────────────────────────────────────────────

  async getTopInasistentes(
    user: AuthUser,
    seccionId: string,
    periodoId: string,
    limit = 10,
  ): Promise<TopInasistenteRow[]> {
    await this.assertCanViewSeccion(user, seccionId);

    const sql = `
            SELECT
                a.id                                                AS alumno_id,
                cu.numero_documento                                 AS dni,
                a.apellido_paterno,
                a.apellido_materno,
                a.nombre                                            AS nombre,
                COUNT(*) FILTER (WHERE ag.estado = 'falta')::int    AS faltas,
                COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int AS tardanzas,
                COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int
                                                                    AS justificadas
            FROM matriculas m
            JOIN alumnos    a  ON a.id = m.alumno_id
            JOIN cuentas    cu ON cu.id = a.id
            LEFT JOIN asistencias_generales ag
                   ON ag.alumno_id  = a.id
                  AND ag.seccion_id = m.seccion_id
                  AND ag.periodo_id = m.periodo_id
            WHERE m.seccion_id = $1
              AND m.periodo_id = $2
              AND m.activo = true
            GROUP BY a.id, cu.numero_documento, a.apellido_paterno,
                     a.apellido_materno, a.nombre
            HAVING COUNT(*) FILTER (WHERE ag.estado = 'falta') > 0
            ORDER BY faltas DESC, tardanzas DESC, a.apellido_paterno
            LIMIT $3
        `;
    return this.ds.query(sql, [seccionId, periodoId, limit]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Autorización
  // ─────────────────────────────────────────────────────────────────────

  private async assertCanViewSeccion(
    user: AuthUser,
    seccionId: string,
  ): Promise<void> {
    if (user.rol === 'admin') return;
    if (user.rol === 'auxiliar' || user.rol === 'psicologa') return;
    if (user.rol === 'docente') {
      const isTutor = await this.docenteIsTutor(user.id, seccionId);
      if (isTutor) return;
    }
    throw new ForbiddenException('No tienes acceso a esta sección');
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
// Tipos
// ──────────────────────────────────────────────────────────────────────────

export interface AsistenciaDiariaRow {
  alumno_id: string;
  dni: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombre: string;
  estado: 'asistio' | 'falta' | 'tardanza' | 'justificado' | 'sin-registro';
  observacion: string | null;
  fecha: string | null;
}

export interface ResumenInasistenciaRow {
  alumno_id: string;
  dni: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombre: string;
  dias_registrados: number;
  asistencias: number;
  tardanzas: number;
  faltas: number;
  justificadas: number;
  porcentaje_asistencia: number | null;
}

export interface TopInasistenteRow {
  alumno_id: string;
  dni: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombre: string;
  faltas: number;
  tardanzas: number;
  justificadas: number;
}
