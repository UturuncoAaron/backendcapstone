import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SharedDashboardQueries } from '../shared/shared-dashboard.queries';
import {
    PadreDashboardDto, HijoItem, CitaItem, LibretaItem,
} from '../dto/padre-dashboard.dto';

@Injectable()
export class PadreDashboardProvider {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly shared: SharedDashboardQueries,
    ) { }

    async getResumen(padreId: string): Promise<PadreDashboardDto> {
        const [existe] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM padres WHERE id = $1`,
            [padreId],
        );
        if (!existe) throw new NotFoundException(`Padre no encontrado (id: ${padreId})`);

        const [hijos, citasProximas, comunicados, libretas] = await Promise.all([
            this.getHijos(padreId),
            this.getCitasProximas(padreId),
            this.shared.getComunicados(['padres', 'todos']),
            this.getLibretas(padreId),
        ]);

        // Enriquecer cada hijo con métricas en paralelo (1 query por hijo, 3 sub-queries empaquetadas)
        const hijosConMetricas = await Promise.all(
            hijos.map(h => this.enrichHijoMetrics(h, padreId)),
        );

        return { hijos: hijosConMetricas, citasProximas, comunicados, libretas };
    }

    // ─── Hijos base ─────────────────────────────────────────────────────────
    private getHijos(padreId: string): Promise<HijoItem[]> {
        return this.db.query<HijoItem[]>(
            `SELECT a.id                     AS "alumnoId",
              a.nombre,
              a.apellido_paterno       AS "apellidoPaterno",
              a.apellido_materno       AS "apellidoMaterno",
              a.codigo_estudiante      AS "codigoEstudiante",
              a.foto_storage_key       AS "fotoStorageKey",
              g.nombre                 AS grado,
              s.nombre                 AS seccion,
              s.id                     AS "seccionId"
       FROM   padre_alumno pa
       JOIN   alumnos   a ON a.id  = pa.alumno_id
       JOIN   cuentas   cu ON cu.id = a.id AND cu.activo = TRUE
       LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.activo = TRUE
       LEFT JOIN secciones  s ON s.id = m.seccion_id
       LEFT JOIN grados     g ON g.id = s.grado_id
       WHERE  pa.padre_id = $1
       ORDER  BY a.apellido_paterno, a.nombre`,
            [padreId],
        );
    }

    // ─── Métricas por hijo (un solo query empaquetado) ──────────────────────
    private async enrichHijoMetrics(hijo: HijoItem, padreId: string): Promise<HijoItem> {
        const [row] = await this.db.query(
            `SELECT
               -- Promedio general del periodo activo
               (
                 SELECT ROUND(AVG(n.nota)::numeric, 2)
                 FROM   notas n
                 JOIN   periodos p ON p.id = n.periodo_id AND p.activo = TRUE
                 WHERE  n.alumno_id = $1
                   AND  n.nota IS NOT NULL
               ) AS "promedioGeneral",

               -- % asistencia general del periodo activo
               (
                 SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                        ELSE ROUND(
                          COUNT(*) FILTER (WHERE ag.estado = 'asistio')::numeric * 100.0
                          / COUNT(*)::numeric, 1
                        ) END
                 FROM   asistencias_generales ag
                 JOIN   periodos p ON p.id = ag.periodo_id AND p.activo = TRUE
                 WHERE  ag.alumno_id = $1
               ) AS "porcentajeAsistencia",

               -- Citas pendientes/confirmadas
               (
                 SELECT COUNT(*)::int
                 FROM   citas ci
                 WHERE  ci.padre_id = $2
                   AND  ci.alumno_id = $1
                   AND  ci.estado IN ('pendiente','confirmada')
                   AND  ci.fecha_hora >= NOW()
               ) AS "citasPendientes",

               -- ¿Asistió hoy?
               (
                 SELECT CASE ag.estado
                          WHEN 'asistio' THEN TRUE
                          WHEN 'tardanza' THEN TRUE
                          ELSE FALSE
                        END
                 FROM   asistencias_generales ag
                 WHERE  ag.alumno_id = $1
                   AND  ag.fecha = CURRENT_DATE
                 LIMIT  1
               ) AS "asistioHoy"`,
            [hijo.alumnoId, padreId],
        );

        return {
            ...hijo,
            promedioGeneral: row?.promedioGeneral != null ? Number(row.promedioGeneral) : null,
            porcentajeAsistencia: row?.porcentajeAsistencia != null ? Number(row.porcentajeAsistencia) : null,
            citasPendientes: Number(row?.citasPendientes ?? 0),
            asistioHoy: row?.asistioHoy ?? null,
        };
    }

    // ─── Citas próximas ─────────────────────────────────────────────────────
    private getCitasProximas(padreId: string): Promise<CitaItem[]> {
        return this.db.query<CitaItem[]>(
            `SELECT ci.id,
            ci.tipo,
            ci.modalidad,
            ci.fecha_hora       AS "fechaHora",
            ci.estado,
            ci.alumno_id        AS "alumnoId",
            CONCAT(a.nombre, ' ', a.apellido_paterno) AS "alumnoNombre",
            COALESCE(
              CONCAT(d.nombre,  ' ', d.apellido_paterno),
              CONCAT(ad.nombre, ' ', ad.apellido_paterno),
              CONCAT(ps.nombre, ' ', ps.apellido_paterno),
              'Personal del colegio'
            ) AS "convocadoPor"
     FROM   citas ci
     JOIN   alumnos   a   ON a.id  = ci.alumno_id
     LEFT JOIN docentes   d   ON d.id  = ci.convocado_por_id
     LEFT JOIN admins     ad  ON ad.id = ci.convocado_por_id
     LEFT JOIN psicologas ps  ON ps.id = ci.convocado_por_id
     WHERE  ci.padre_id = $1
       AND  ci.estado  IN ('pendiente', 'confirmada')
       AND  ci.fecha_hora >= NOW()
     ORDER  BY ci.fecha_hora ASC
     LIMIT  5`,
            [padreId],
        );
    }

    // ─── Libretas recientes ─────────────────────────────────────────────────
    private getLibretas(padreId: string): Promise<LibretaItem[]> {
        return this.db.query<LibretaItem[]>(
            `SELECT l.id,
              p.nombre                             AS "periodoNombre",
              l.storage_key                        AS "storageKey",
              l.created_at                         AS "creadaEn",
              CONCAT(a.nombre, ' ', a.apellido_paterno) AS "alumnoNombre"
       FROM   libretas      l
       JOIN   periodos       p  ON p.id      = l.periodo_id
       JOIN   padre_alumno   pa ON pa.alumno_id = l.cuenta_id
       JOIN   alumnos        a  ON a.id = l.cuenta_id
       WHERE  pa.padre_id = $1
         AND  l.tipo      = 'alumno'
       ORDER  BY l.created_at DESC
       LIMIT  5`,
            [padreId],
        );
    }
}