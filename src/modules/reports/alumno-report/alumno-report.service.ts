// Ubicación: src/modules/reports/alumno-report/alumno-report.service.ts
//
// Servicio agregador del reporte general de un alumno. Consulta todas
// las fuentes relevantes y devuelve un único JSON listo para renderizar
// en la vista imprimible del frontend.

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { StorageService } from '../../storage/storage.service.js';

export interface AlumnoBase {
    id: string;
    codigo_estudiante: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    fecha_nacimiento: string | null;
    telefono: string | null;
    email: string | null;
    inclusivo: boolean;
    foto_storage_key: string | null;
    numero_documento: string | null;
    tipo_documento: string | null;
    activo: boolean;
    anio_ingreso: number | null;
}

export interface MatriculaReportRow {
    id: string;
    activo: boolean;
    fecha_matricula: string;
    periodo_id: string;
    periodo_nombre: string;
    periodo_anio: number;
    periodo_bimestre: number;
    seccion_id: string;
    seccion: string;
    grado_id: string;
    grado: string;
    grado_orden: number;
    tutor_nombre: string | null;
    tutor_apellido_paterno: string | null;
    tutor_apellido_materno: string | null;
}

export interface PadreReportRow {
    id: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    email: string | null;
    telefono: string | null;
    relacion: string | null;
    numero_documento: string | null;
    tipo_documento: string | null;
}

export interface LibretaReportRow {
    id: string;
    tipo: string;
    nombre_archivo: string | null;
    storage_key: string;
    observaciones: string | null;
    periodo_id: string;
    periodo_nombre: string;
    periodo_anio: number;
    periodo_bimestre: number;
    created_at: string;
}

export interface LibretaReportItem extends LibretaReportRow {
    url: string | null;
}

export interface NotaCursoBimestreRow {
    anio: number;
    bimestre: number;
    periodo_nombre: string;
    curso_id: string;
    curso: string;
    color: string | null;
    promedio: string;
    cantidad: number;
}

export interface NotaBimestreRow {
    anio: number;
    bimestre: number;
    periodo_nombre: string;
    promedio_general: string;
    cursos: number;
}

export interface NotaDetalleRow {
    id: string;
    anio: number;
    bimestre: number;
    periodo_nombre: string;
    curso: string;
    titulo: string;
    tipo: string;
    nota: string | null;
    observaciones: string | null;
    fecha: string | null;
}

export interface AsistenciaBimestreRow {
    anio: number;
    bimestre: number;
    periodo_nombre: string;
    total: number;
    asistio: number;
    tardanza: number;
    justificado: number;
    falta: number;
}

export interface AsistenciaTotalRow {
    total: number;
    asistio: number;
    tardanza: number;
    justificado: number;
    falta: number;
}

export interface AsistenciaDetalleRow {
    id: string;
    fecha: string;
    estado: string;
    observacion: string | null;
    periodo_nombre: string;
    periodo_anio: number;
    periodo_bimestre: number;
    grado: string | null;
    seccion: string | null;
}

export interface PsicologiaCategoriaRow {
    categoria: string;
    cantidad: number;
}

export interface PsicologiaResumen {
    asignaciones: number;
    fichas: number;
    ultima_ficha: string | null;
    categorias: PsicologiaCategoriaRow[];
}

export interface CitaResumenRow {
    total: number;
    pendientes: number;
    confirmadas: number;
    realizadas: number;
    canceladas: number;
}

export interface CitaUltimaRow {
    id: string;
    tipo: string;
    modalidad: string;
    motivo: string;
    estado: string;
    fecha_hora: string;
    notas_previas: string | null;
    notas_posteriores: string | null;
}

export interface CitaResumen extends CitaResumenRow {
    ultimas: CitaUltimaRow[];
}

const EMPTY_ASISTENCIA_TOTAL: AsistenciaTotalRow = {
    total: 0,
    asistio: 0,
    tardanza: 0,
    justificado: 0,
    falta: 0,
};

const EMPTY_CITAS: CitaResumen = {
    total: 0,
    pendientes: 0,
    confirmadas: 0,
    realizadas: 0,
    canceladas: 0,
    ultimas: [],
};

@Injectable()
export class AlumnoReportService {
    private readonly logger = new Logger(AlumnoReportService.name);

    /**
     * `alumnos.anio_ingreso` puede no existir en algunos entornos.
     * Detectamos su presencia una sola vez y cacheamos el resultado.
     */
    private anioIngresoExists: boolean | null = null;

    constructor(
        @InjectDataSource() private readonly ds: DataSource,
        private readonly storage: StorageService,
    ) { }

    private async hasAnioIngreso(): Promise<boolean> {
        if (this.anioIngresoExists !== null) return this.anioIngresoExists;
        const rows = await this.ds.query<{ exists: boolean }[]>(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'alumnos' AND column_name = 'anio_ingreso'
            ) AS exists
        `);
        this.anioIngresoExists = !!rows[0]?.exists;
        return this.anioIngresoExists;
    }

    // ─────────────────────────────────────────────────────────────
    // ENTRYPOINT: arma el reporte completo del alumno
    // ─────────────────────────────────────────────────────────────
    async buildReport(alumnoId: string, anio?: number) {
        const personal = await this.fetchPersonal(alumnoId);
        if (!personal) {
            throw new NotFoundException(`Alumno ${alumnoId} no encontrado`);
        }

        const [
            matriculas,
            padres,
            libretas,
            notasResumen,
            asistencia,
            psicologia,
            citas,
        ] = await Promise.all([
            this.fetchMatriculas(alumnoId, anio),
            this.fetchPadres(alumnoId),
            this.fetchLibretas(alumnoId, anio),
            this.fetchNotasResumen(alumnoId, anio),
            this.fetchAsistenciaResumen(alumnoId, anio),
            this.fetchPsicologiaResumen(alumnoId),
            this.fetchCitasResumen(alumnoId, anio),
        ]);

        return {
            generado_en: new Date().toISOString(),
            anio_filtro: anio ?? null,
            personal,
            matriculas,
            padres,
            libretas,
            notas: notasResumen,
            asistencia,
            psicologia,
            citas,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Bloques individuales
    // ─────────────────────────────────────────────────────────────

    private async fetchPersonal(
        alumnoId: string,
    ): Promise<(AlumnoBase & { foto_url: string | null }) | null> {
        const hasAnio = await this.hasAnioIngreso();
        const anioSel = hasAnio ? 'a.anio_ingreso' : 'NULL::int AS anio_ingreso';
        const rows = await this.ds.query<AlumnoBase[]>(
            `
            SELECT a.id,
                   a.codigo_estudiante,
                   a.nombre,
                   a.apellido_paterno,
                   a.apellido_materno,
                   a.fecha_nacimiento,
                   a.telefono,
                   a.email,
                   a.inclusivo,
                   a.foto_storage_key,
                   c.numero_documento,
                   c.tipo_documento,
                   c.activo,
                   ${anioSel}
              FROM alumnos a
              JOIN cuentas c ON c.id = a.id
             WHERE a.id = $1
            `,
            [alumnoId],
        );
        const r = rows[0];
        if (!r) return null;
        return {
            ...r,
            foto_url: r.foto_storage_key
                ? this.storage.getPublicUrl(r.foto_storage_key)
                : null,
        };
    }

    private async fetchMatriculas(
        alumnoId: string,
        anio?: number,
    ): Promise<MatriculaReportRow[]> {
        const params: (string | number)[] = [alumnoId];
        let extra = '';
        if (anio !== undefined) {
            params.push(anio);
            extra = `AND p.anio = $${params.length}`;
        }
        return this.ds.query<MatriculaReportRow[]>(
            `
            SELECT m.id,
                   m.activo,
                   m.fecha_matricula,
                   p.id        AS periodo_id,
                   p.nombre    AS periodo_nombre,
                   p.anio      AS periodo_anio,
                   p.bimestre  AS periodo_bimestre,
                   s.id        AS seccion_id,
                   s.nombre    AS seccion,
                   g.id        AS grado_id,
                   g.nombre    AS grado,
                   g.orden     AS grado_orden,
                   t.nombre            AS tutor_nombre,
                   t.apellido_paterno  AS tutor_apellido_paterno,
                   t.apellido_materno  AS tutor_apellido_materno
              FROM matriculas m
              JOIN periodos  p ON p.id = m.periodo_id
              JOIN secciones s ON s.id = m.seccion_id
              JOIN grados    g ON g.id = s.grado_id
              LEFT JOIN docentes t ON t.id = s.tutor_id
             WHERE m.alumno_id = $1
             ${extra}
             ORDER BY p.anio DESC, p.bimestre DESC, g.orden ASC
            `,
            params,
        );
    }

    private async fetchPadres(alumnoId: string): Promise<PadreReportRow[]> {
        return this.ds
            .query<PadreReportRow[]>(
                `
            SELECT p.id,
                   p.nombre,
                   p.apellido_paterno,
                   p.apellido_materno,
                   p.email,
                   p.telefono,
                   pa.relacion,
                   c.numero_documento,
                   c.tipo_documento
              FROM padre_alumno pa
              JOIN padres  p ON p.id = pa.padre_id
              JOIN cuentas c ON c.id = p.id
             WHERE pa.alumno_id = $1
               AND c.activo = TRUE
             ORDER BY p.apellido_paterno, p.nombre
            `,
                [alumnoId],
            )
            .catch((err) => {
                // pa.relacion no siempre existe — fallback sin la columna.
                this.logger.warn(
                    `fetchPadres con 'relacion' falló (${(err as Error).message}); reintentando sin esa columna.`,
                );
                return this.ds.query<PadreReportRow[]>(
                    `
                SELECT p.id, p.nombre, p.apellido_paterno, p.apellido_materno,
                       p.email, p.telefono, NULL AS relacion,
                       c.numero_documento, c.tipo_documento
                  FROM padre_alumno pa
                  JOIN padres  p ON p.id = pa.padre_id
                  JOIN cuentas c ON c.id = p.id
                 WHERE pa.alumno_id = $1 AND c.activo = TRUE
                 ORDER BY p.apellido_paterno, p.nombre
                `,
                    [alumnoId],
                );
            });
    }

    private async fetchLibretas(
        alumnoId: string,
        anio?: number,
    ): Promise<LibretaReportItem[]> {
        const params: (string | number)[] = [alumnoId];
        let extra = '';
        if (anio !== undefined) {
            params.push(anio);
            extra = `AND p.anio = $${params.length}`;
        }
        const rows = await this.ds.query<LibretaReportRow[]>(
            `
            SELECT l.id,
                   l.tipo,
                   l.nombre_archivo,
                   l.storage_key,
                   l.observaciones,
                   l.created_at,
                   p.id       AS periodo_id,
                   p.nombre   AS periodo_nombre,
                   p.anio     AS periodo_anio,
                   p.bimestre AS periodo_bimestre
              FROM libretas l
              JOIN periodos p ON p.id = l.periodo_id
             WHERE l.cuenta_id = $1
               ${extra}
             ORDER BY p.anio DESC, p.bimestre DESC, l.tipo ASC
            `,
            params,
        );

        // Generamos URLs firmadas en paralelo (las libretas son
        // archivos privados en storage, así que necesitan firma).
        const items: LibretaReportItem[] = await Promise.all(
            rows.map(async (r): Promise<LibretaReportItem> => {
                const url = await this.buildSignedUrl(r.storage_key);
                return { ...r, url };
            }),
        );
        return items;
    }

    private async buildSignedUrl(storageKey: string): Promise<string | null> {
        try {
            return await this.storage.getSignedUrl(storageKey);
        } catch {
            return null;
        }
    }

    private async fetchNotasResumen(
        alumnoId: string,
        anio?: number,
    ): Promise<{
        por_curso_bimestre: NotaCursoBimestreRow[];
        por_bimestre: NotaBimestreRow[];
        detalle: NotaDetalleRow[];
    }> {
        const params: (string | number)[] = [alumnoId];
        let extra = '';
        if (anio !== undefined) {
            params.push(anio);
            extra = `AND p.anio = $${params.length}`;
        }
        const [porCursoBimestre, porBimestre, detalle] = await Promise.all([
            this.ds.query<NotaCursoBimestreRow[]>(
                `
                SELECT p.anio, p.bimestre, p.nombre AS periodo_nombre,
                       c.id AS curso_id, c.nombre AS curso, c.color,
                       AVG(n.nota)::numeric(5,2) AS promedio,
                       COUNT(n.id)::int AS cantidad
                  FROM notas n
                  JOIN cursos   c ON c.id = n.curso_id
                  JOIN periodos p ON p.id = n.periodo_id
                 WHERE n.alumno_id = $1
                   AND n.nota IS NOT NULL
                   ${extra}
                 GROUP BY p.anio, p.bimestre, p.nombre, c.id, c.nombre, c.color
                 ORDER BY p.anio DESC, p.bimestre ASC, c.nombre ASC
                `,
                params,
            ),
            this.ds.query<NotaBimestreRow[]>(
                `
                SELECT p.anio, p.bimestre, p.nombre AS periodo_nombre,
                       AVG(n.nota)::numeric(5,2) AS promedio_general,
                       COUNT(DISTINCT n.curso_id)::int AS cursos
                  FROM notas n
                  JOIN periodos p ON p.id = n.periodo_id
                 WHERE n.alumno_id = $1
                   AND n.nota IS NOT NULL
                   ${extra}
                 GROUP BY p.anio, p.bimestre, p.nombre
                 ORDER BY p.anio DESC, p.bimestre ASC
                `,
                params,
            ),
            this.ds.query<NotaDetalleRow[]>(
                `
                SELECT n.id,
                       p.anio,
                       p.bimestre,
                       p.nombre AS periodo_nombre,
                       c.nombre AS curso,
                       n.titulo,
                       n.tipo,
                       n.nota::numeric(5,2) AS nota,
                       n.observaciones,
                       n.fecha
                  FROM notas n
                  JOIN cursos   c ON c.id = n.curso_id
                  JOIN periodos p ON p.id = n.periodo_id
                 WHERE n.alumno_id = $1
                   ${extra}
                 ORDER BY p.anio DESC, p.bimestre ASC,
                          c.nombre ASC, n.fecha DESC NULLS LAST, n.titulo ASC
                `,
                params,
            ),
        ]);

        return {
            por_curso_bimestre: porCursoBimestre,
            por_bimestre: porBimestre,
            detalle,
        };
    }

    private async fetchAsistenciaResumen(
        alumnoId: string,
        anio?: number,
    ): Promise<{
        total: AsistenciaTotalRow;
        por_bimestre: AsistenciaBimestreRow[];
        detalle: AsistenciaDetalleRow[];
        porcentaje_asistencia: number | null;
    }> {
        const params: (string | number)[] = [alumnoId];
        let extra = '';
        if (anio !== undefined) {
            params.push(anio);
            extra = `AND p.anio = $${params.length}`;
        }
        const porBimestrePromise = this.ds
            .query<AsistenciaBimestreRow[]>(
                `
            SELECT p.anio,
                   p.bimestre,
                   p.nombre AS periodo_nombre,
                   COUNT(*)::int                                    AS total,
                   COUNT(*) FILTER (WHERE ag.estado = 'asistio')::int    AS asistio,
                   COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int   AS tardanza,
                   COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int AS justificado,
                   COUNT(*) FILTER (WHERE ag.estado = 'falta')::int      AS falta
              FROM asistencias_generales ag
              JOIN periodos p ON p.id = ag.periodo_id
             WHERE ag.alumno_id = $1
               ${extra}
             GROUP BY p.anio, p.bimestre, p.nombre
             ORDER BY p.anio DESC, p.bimestre ASC
            `,
                params,
            )
            .catch((err) => {
                this.logger.warn(
                    `asistencias_generales falló (${(err as Error).message})`,
                );
                return [];
            });

        const totalRowsPromise = this.ds
            .query<AsistenciaTotalRow[]>(
                `
            SELECT COUNT(*)::int                                    AS total,
                   COUNT(*) FILTER (WHERE ag.estado = 'asistio')::int    AS asistio,
                   COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int   AS tardanza,
                   COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int AS justificado,
                   COUNT(*) FILTER (WHERE ag.estado = 'falta')::int      AS falta
              FROM asistencias_generales ag
              JOIN periodos p ON p.id = ag.periodo_id
             WHERE ag.alumno_id = $1
               ${extra}
            `,
                params,
            )
            .catch(() => [EMPTY_ASISTENCIA_TOTAL]);

        const detallePromise = this.ds
            .query<AsistenciaDetalleRow[]>(
                `
            SELECT ag.id,
                   ag.fecha,
                   ag.estado,
                   ag.observacion,
                   p.nombre AS periodo_nombre,
                   p.anio AS periodo_anio,
                   p.bimestre AS periodo_bimestre,
                   g.nombre AS grado,
                   s.nombre AS seccion
              FROM asistencias_generales ag
              JOIN periodos p ON p.id = ag.periodo_id
              LEFT JOIN secciones s ON s.id = ag.seccion_id
              LEFT JOIN grados g ON g.id = s.grado_id
             WHERE ag.alumno_id = $1
               ${extra}
             ORDER BY ag.fecha DESC
            `,
                params,
            )
            .catch((err) => {
                this.logger.warn(
                    `detalle de asistencias_generales falló (${(err as Error).message})`,
                );
                return [];
            });

        const [porBimestre, totalRows, detalle] = await Promise.all([
            porBimestrePromise,
            totalRowsPromise,
            detallePromise,
        ]);

        const total = totalRows[0] ?? EMPTY_ASISTENCIA_TOTAL;
        const porcentajeAsistencia =
            total.total > 0
                ? Math.round(((total.asistio + total.tardanza) / total.total) * 1000) /
                10
                : null;

        return {
            total,
            por_bimestre: porBimestre,
            detalle,
            porcentaje_asistencia: porcentajeAsistencia,
        };
    }

    private async fetchPsicologiaResumen(
        alumnoId: string,
    ): Promise<PsicologiaResumen> {
        const empty: PsicologiaResumen = {
            asignaciones: 0,
            fichas: 0,
            ultima_ficha: null,
            categorias: [],
        };

        try {
            const [asignacionesRows, fichasRows, categorias] = await Promise.all([
                this.ds.query<{ total: number }[]>(
                    `
                    SELECT COUNT(*)::int AS total
                      FROM psicologa_alumno
                     WHERE alumno_id = $1
                       AND activo = TRUE
                    `,
                    [alumnoId],
                ),
                this.ds.query<{ total: number; ultima_ficha: string | null }[]>(
                    `
                    SELECT COUNT(*)::int AS total,
                           MAX(created_at) AS ultima_ficha
                      FROM fichas_psicologia
                     WHERE alumno_id = $1
                    `,
                    [alumnoId],
                ),
                this.ds.query<PsicologiaCategoriaRow[]>(
                    `
                    SELECT categoria, COUNT(*)::int AS cantidad
                      FROM fichas_psicologia
                     WHERE alumno_id = $1
                     GROUP BY categoria
                     ORDER BY cantidad DESC, categoria ASC
                    `,
                    [alumnoId],
                ),
            ]);

            return {
                asignaciones: asignacionesRows[0]?.total ?? 0,
                fichas: fichasRows[0]?.total ?? 0,
                ultima_ficha: fichasRows[0]?.ultima_ficha ?? null,
                categorias,
            };
        } catch (err) {
            this.logger.warn(
                `psicología no disponible para reporte (${(err as Error).message})`,
            );
            return empty;
        }
    }

    private async fetchCitasResumen(
        alumnoId: string,
        anio?: number,
    ): Promise<CitaResumen> {
        const params: (string | number)[] = [alumnoId];
        let extra = '';
        if (anio !== undefined) {
            params.push(anio);
            extra = `AND EXTRACT(YEAR FROM c.fecha_hora)::int = $${params.length}`;
        }

        try {
            const [resumenRows, ultimas] = await Promise.all([
                this.ds.query<CitaResumenRow[]>(
                    `
                    SELECT COUNT(*)::int AS total,
                           COUNT(*) FILTER (WHERE c.estado = 'pendiente')::int AS pendientes,
                           COUNT(*) FILTER (WHERE c.estado = 'confirmada')::int AS confirmadas,
                           COUNT(*) FILTER (WHERE c.estado = 'realizada')::int AS realizadas,
                           COUNT(*) FILTER (WHERE c.estado = 'cancelada')::int AS canceladas
                      FROM citas c
                     WHERE c.alumno_id = $1
                       ${extra}
                    `,
                    params,
                ),
                this.ds.query<CitaUltimaRow[]>(
                    `
                    SELECT c.id,
                           c.tipo,
                           c.modalidad,
                           c.motivo,
                           c.estado,
                           c.fecha_hora,
                           c.notas_previas,
                           c.notas_posteriores
                      FROM citas c
                     WHERE c.alumno_id = $1
                       ${extra}
                     ORDER BY c.fecha_hora DESC
                     LIMIT 10
                    `,
                    params,
                ),
            ]);

            return {
                ...(resumenRows[0] ?? EMPTY_CITAS),
                ultimas,
            };
        } catch (err) {
            this.logger.warn(
                `citas no disponibles para reporte (${(err as Error).message})`,
            );
            return EMPTY_CITAS;
        }
    }
}
