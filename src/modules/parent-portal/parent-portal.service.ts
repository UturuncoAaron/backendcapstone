import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ParentPortalService {
    constructor(private readonly dataSource: DataSource) { }

    // ─── Verificar vínculo padre-alumno ─────────────────────────────────────
    private async verifyRelation(padreId: string, alumnoId: string) {
        const rel = await this.dataSource.query(
            `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2`,
            [padreId, alumnoId],
        );
        if (!rel.length) {
            throw new ForbiddenException('No tienes acceso a este alumno');
        }
    }

    // ─── Listar hijos del padre ─────────────────────────────────────────────
    async getChildren(padreId: string) {
        return this.dataSource.query(`
            SELECT
                a.id,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                a.codigo_estudiante,
                a.foto_storage_key,
                g.nombre  AS grado,
                s.nombre  AS seccion,
                s.id      AS seccion_id
            FROM padre_alumno pa
            JOIN alumnos a    ON a.id = pa.alumno_id
            JOIN cuentas c    ON c.id = a.id AND c.activo = true
            LEFT JOIN matriculas m  ON m.alumno_id = a.id AND m.activo = true
            LEFT JOIN secciones s   ON s.id = m.seccion_id
            LEFT JOIN grados g      ON g.id = s.grado_id
            WHERE pa.padre_id = $1
            ORDER BY a.apellido_paterno, a.nombre
        `, [padreId]);
    }

    // ─── Notas del hijo ─────────────────────────────────────────────────────
    async getChildGrades(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        return this.dataSource.query(`
            SELECT
                n.id,
                p.bimestre,
                p.anio,
                p.nombre             AS periodo,
                c.nombre             AS curso,
                n.titulo,
                n.tipo,
                n.nota,
                n.observaciones,
                n.fecha
            FROM notas n
            JOIN cursos   c ON c.id = n.curso_id
            JOIN periodos p ON p.id = n.periodo_id
            WHERE n.alumno_id = $1
            ORDER BY p.anio DESC, p.bimestre ASC, c.nombre ASC, n.fecha DESC
        `, [alumnoId]);
    }

    // ─── Asistencia por curso (docente marca asistencia diaria) ───────────
    async getChildAttendance(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        try {
            return await this.dataSource.query(`
                SELECT
                    a.presente,
                    a.justificacion,
                    a.fecha        AS fecha_hora,
                    c.nombre       AS curso
                FROM asistencias a
                JOIN cursos c ON c.id = a.curso_id
                WHERE a.alumno_id = $1
                ORDER BY a.fecha DESC
                LIMIT 100
            `, [alumnoId]);
        } catch (err) {
            console.error('[ParentPortal] getChildAttendance error:', err);
            return [];
        }
    }

    // ─── Asistencia general diaria (entrada/tutor) ──────────────────────────
    async getChildAttendanceGeneral(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        // Resumen total
        const [resumen] = await this.dataSource.query(`
            SELECT
                COUNT(*)::int                                          AS total,
                COUNT(*) FILTER (WHERE ag.estado = 'asistio')::int     AS asistio,
                COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int    AS tardanza,
                COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int AS justificado,
                COUNT(*) FILTER (WHERE ag.estado = 'falta')::int       AS falta,
                CASE WHEN COUNT(*) = 0 THEN NULL
                     ELSE ROUND(
                       COUNT(*) FILTER (WHERE ag.estado IN ('asistio','tardanza'))::numeric
                       * 100.0 / COUNT(*)::numeric, 1
                     ) END AS porcentaje
            FROM asistencias_generales ag
            JOIN periodos p ON p.id = ag.periodo_id AND p.activo = TRUE
            WHERE ag.alumno_id = $1
        `, [alumnoId]);

        // Detalle diario (últimos 90 días para rendimiento)
        const detalle = await this.dataSource.query(`
            SELECT
                ag.id,
                ag.fecha,
                ag.estado,
                ag.observacion,
                p.nombre  AS periodo_nombre,
                p.anio    AS periodo_anio,
                p.bimestre AS periodo_bimestre
            FROM asistencias_generales ag
            JOIN periodos p ON p.id = ag.periodo_id
            WHERE ag.alumno_id = $1
            ORDER BY ag.fecha DESC
            LIMIT 90
        `, [alumnoId]);

        return { resumen, detalle };
    }

    // ─── Horario del hijo (por sección + periodo activo) ────────────────────
    async getChildSchedule(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        return this.dataSource.query(`
            SELECT
                h.dia_semana   AS "diaSemana",
                h.hora_inicio  AS "horaInicio",
                h.hora_fin     AS "horaFin",
                c.nombre       AS curso,
                h.aula,
                CONCAT(d.nombre, ' ', d.apellido_paterno) AS docente
            FROM horarios h
            JOIN cursos   c  ON c.id = h.curso_id
            LEFT JOIN docentes d ON d.id = c.docente_id
            JOIN matriculas m ON m.alumno_id = $1 AND m.activo = TRUE
            JOIN secciones  s ON s.id = m.seccion_id
            WHERE h.curso_id IN (
                SELECT cc.id FROM cursos cc WHERE cc.seccion_id = s.id
            )
            ORDER BY
                CASE h.dia_semana
                    WHEN 'lunes' THEN 1 WHEN 'martes' THEN 2 WHEN 'miercoles' THEN 3
                    WHEN 'jueves' THEN 4 WHEN 'viernes' THEN 5
                END,
                h.hora_inicio
        `, [alumnoId]);
    }

    // ─── Libretas del hijo ──────────────────────────────────────────────────
    async getChildLibretas(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        return this.dataSource.query(`
            SELECT
                l.id,
                l.storage_key,
                l.nombre_archivo,
                l.observaciones,
                l.created_at,
                p.bimestre,
                p.anio,
                p.nombre AS periodo
            FROM libretas l
            JOIN periodos p ON p.id = l.periodo_id
            WHERE l.cuenta_id = $1
            ORDER BY p.anio DESC, p.bimestre DESC
        `, [alumnoId]);
    }
}