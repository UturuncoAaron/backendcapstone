import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SharedDashboardQueries } from '../shared/shared-dashboard.queries';
import { PadreDashboardDto, HijoItem, CitaItem, LibretaItem } from '../dto/padre-dashboard.dto';
import { StorageService } from '../../storage/storage.service';

interface LibretaRow {
    id: string;
    periodoNombre: string;
    storageKey: string;
    creadaEn: Date;
    alumnoNombre: string;
    tipo: 'alumno' | 'padre';
}

@Injectable()
export class PadreDashboardProvider {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly shared: SharedDashboardQueries,
        private readonly storage: StorageService,
    ) { }

    async getResumen(padreId: string): Promise<PadreDashboardDto> {
        const [existe] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM padres WHERE id = $1`,
            [padreId],
        );
        if (!existe) throw new NotFoundException(`Padre no encontrado (id: ${padreId})`);

        // Obtiene todos los bloques de datos principales en paralelo
        const [hijosConMetricas, citasProximas, comunicados, libretas] = await Promise.all([
            this.getHijosConMetricasGlobal(padreId),
            this.getCitasProximas(padreId),
            this.shared.getComunicados(['padres', 'todos']),
            this.getLibretas(padreId),
        ]);

        return { hijos: hijosConMetricas, citasProximas, comunicados, libretas };
    }

    // Consulta global de hijos con sus promedios, asistencia y estados del periodo activo
    private getHijosConMetricasGlobal(padreId: string): Promise<HijoItem[]> {
        return this.db.query<HijoItem[]>(
            `SELECT 
                a.id AS "alumnoId",
                a.nombre,
                a.apellido_paterno AS "apellidoPaterno",
                a.apellido_materno AS "apellidoMaterno",
                a.codigo_estudiante AS "codigoEstudiante",
                a.foto_storage_key AS "fotoStorageKey",
                g.nombre AS grado,
                s.nombre AS seccion,
                s.id AS "seccionId",
                (
                    SELECT ROUND(AVG(n.nota)::numeric, 2)
                    FROM notas n
                    JOIN periodos p ON p.id = n.periodo_id AND p.activo = TRUE
                    WHERE n.alumno_id = a.id AND n.nota IS NOT NULL
                ) AS "promedioGeneral",
                (
                    SELECT CASE 
                             WHEN COUNT(*) = 0 THEN NULL
                             ELSE ROUND((COUNT(*) FILTER (WHERE ag.estado IN ('asistio', 'tardanza'))::numeric * 100.0) / COUNT(*)::numeric, 1)
                           END
                    FROM asistencias_generales ag
                    JOIN periodos p ON p.id = ag.periodo_id AND p.activo = TRUE
                    WHERE ag.alumno_id = a.id
                ) AS "porcentajeAsistencia",
                (
                    SELECT COUNT(*)::int
                    FROM citas ci
                    WHERE ci.padre_id = $1
                      AND ci.alumno_id = a.id
                      AND ci.estado IN ('pendiente','confirmada')
                      AND ci.fecha_hora >= NOW()
                ) AS "citasPendientes",
                (
                    SELECT CASE ag.estado
                             WHEN 'asistio' THEN TRUE
                             WHEN 'tardanza' THEN TRUE
                             ELSE FALSE
                           END
                    FROM asistencias_generales ag
                    WHERE ag.alumno_id = a.id
                      AND ag.fecha = CURRENT_DATE
                    LIMIT 1
                ) AS "asistioHoy"
             FROM padre_alumno pa
             JOIN alumnos a ON a.id = pa.alumno_id
             JOIN cuentas cu ON cu.id = a.id AND cu.activo = TRUE
             LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.activo = TRUE
             LEFT JOIN secciones s ON s.id = m.seccion_id
             LEFT JOIN grados g ON g.id = s.grado_id
             WHERE pa.padre_id = $1
             ORDER BY a.apellido_paterno, a.nombre`,
            [padreId],
        );
    }

    // Retorna las citas próximas priorizando el nombre de la psicóloga si el tipo es psicoterapéutico
    private getCitasProximas(padreId: string): Promise<CitaItem[]> {
        return this.db.query<CitaItem[]>(
            `SELECT 
                ci.id,
                ci.tipo,
                ci.modalidad,
                ci.fecha_hora AS "fechaHora",
                ci.estado,
                ci.alumno_id AS "alumnoId",
                CONCAT(a.nombre, ' ', a.apellido_paterno) AS "alumnoNombre",
                CASE 
                    WHEN ci.tipo = 'psicologico' THEN 
                        COALESCE(
                            CONCAT(ps_asig.nombre, ' ', ps_asig.apellido_paterno),
                            CONCAT(ps_conv.nombre, ' ', ps_conv.apellido_paterno),
                            'Psicóloga del Colegio'
                        )
                    ELSE 
                        COALESCE(
                            CONCAT(d.nombre,  ' ', d.apellido_paterno),
                            CONCAT(ad.nombre, ' ', ad.apellido_paterno),
                            CONCAT(ps_conv.nombre, ' ', ps_conv.apellido_paterno),
                            'Personal del colegio'
                        )
                END AS "convocadoPor"
             FROM citas ci
             JOIN alumnos a ON a.id = ci.alumno_id
             LEFT JOIN docentes d ON d.id = ci.convocado_por_id
             LEFT JOIN admins ad ON ad.id = ci.convocado_por_id
             LEFT JOIN psicologas ps_conv ON ps_conv.id = ci.convocado_por_id
             LEFT JOIN psicologa_alumno pa_asig ON pa_asig.alumno_id = a.id AND pa_asig.activo = TRUE
             LEFT JOIN psicologas ps_asig ON ps_asig.id = pa_asig.psicologa_id
             WHERE ci.padre_id = $1
               AND ci.estado IN ('pendiente', 'confirmada')
               AND ci.fecha_hora >= NOW()
             ORDER BY ci.fecha_hora ASC
             LIMIT 5`,
            [padreId],
        );
    }

    // Trae las últimas 5 libretas y firma sus URLs de forma asíncrona paralela
    private async getLibretas(padreId: string): Promise<LibretaItem[]> {
        const rows = await this.db.query<LibretaRow[]>(
            `SELECT l.id, p.nombre AS "periodoNombre", l.storage_key AS "storageKey", l.created_at AS "creadaEn", CONCAT(a.nombre, ' ', a.apellido_paterno) AS "alumnoNombre", 'alumno'::text AS "tipo"
             FROM libretas l
             JOIN periodos p ON p.id = l.periodo_id
             JOIN padre_alumno pa ON pa.alumno_id = l.cuenta_id
             JOIN alumnos a ON a.id = l.cuenta_id
             WHERE pa.padre_id = $1 AND l.tipo = 'alumno'
             UNION ALL
             SELECT l.id, p.nombre AS "periodoNombre", l.storage_key AS "storageKey", l.created_at AS "creadaEn", 'Mi libreta' AS "alumnoNombre", 'padre'::text AS "tipo"
             FROM libretas l
             JOIN periodos p ON p.id = l.periodo_id
             WHERE l.cuenta_id = $1 AND l.tipo = 'padre'
             ORDER BY "creadaEn" DESC LIMIT 5`,
            [padreId],
        );

        return Promise.all(
            rows.map(async (r): Promise<LibretaItem> => {
                let signedUrl: string | null = null;
                if (r.storageKey) {
                    try {
                        signedUrl = await this.storage.getSignedUrl(r.storageKey);
                    } catch (err) {
                        signedUrl = null;
                    }
                }
                return {
                    id: r.id,
                    periodoNombre: r.periodoNombre,
                    storageKey: r.storageKey,
                    creadaEn: r.creadaEn,
                    alumnoNombre: r.alumnoNombre,
                    tipo: r.tipo,
                    url: signedUrl,
                };
            }),
        );
    }
}