import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

import { PsychologyArchivosService } from '../psychology/archivos/archivos.service.js';
import { PsychologyReportService } from '../reports/psychology-report/psychology-report.service.js';
import type { AttendanceQueryDto, GradesQueryDto } from './dto/parent-portal-query.dto.js';

export interface NotaRow {
    nota_id: string;
    titulo: string;
    tipo: string;
    nota: number | null;
    observaciones: string | null;
    fecha: string | null;
}

export interface CursoGradesGroup {
    curso_id: string;
    curso_nombre: string;
    area: string | null;
    color: string;
    periodo_id: string;
    periodo_nombre: string;
    bimestre: number;
    anio: number;
    notas: NotaRow[];
    promedio: number | null;
}

export interface AttendanceSummary {
    total: number;
    asistio: number;
    tardanza: number;
    justificado: number;
    falta: number;
    porcentaje: number | null;
}

export interface AttendanceDetalle {
    id: string;
    fecha: string;
    estado: string;
    observacion: string | null;
    periodo_nombre: string;
    periodo_anio: number;
    periodo_bimestre: number;
}

@Injectable()
export class ParentPortalService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly archivosSvc: PsychologyArchivosService,
        private readonly reportSvc: PsychologyReportService,
    ) { }

    private async verifyRelation(padreId: string, alumnoId: string): Promise<void> {
        const rel = await this.dataSource.query<unknown[]>(
            `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2`,
            [padreId, alumnoId],
        );
        if (!rel.length) {
            throw new ForbiddenException('No tienes acceso a este alumno');
        }
    }

    private async resolveAnio(anio?: number): Promise<number> {
        if (anio) return anio;
        const rows = await this.dataSource.query<{ anio: number }[]>(
            `SELECT anio FROM periodos WHERE activo = TRUE LIMIT 1`,
        );
        return rows[0]?.anio ?? new Date().getFullYear();
    }

    async getChildren(padreId: string) {
        return this.dataSource.query<unknown[]>(`
            SELECT
                a.id,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                a.codigo_estudiante,
                a.foto_storage_key,
                g.nombre   AS grado,
                s.nombre   AS seccion,
                s.id       AS seccion_id,
                m.anio     AS anio_matricula
            FROM padre_alumno pa
            JOIN alumnos   a ON a.id = pa.alumno_id
            JOIN cuentas   c ON c.id = a.id AND c.activo = TRUE
            LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.activo = TRUE
            LEFT JOIN secciones  s ON s.id = m.seccion_id
            LEFT JOIN grados     g ON g.id = s.grado_id
            WHERE pa.padre_id = $1
            ORDER BY a.apellido_paterno, a.nombre
        `, [padreId]);
    }

    async getChildGrades(
        padreId: string,
        alumnoId: string,
        query: GradesQueryDto,
    ): Promise<CursoGradesGroup[]> {
        await this.verifyRelation(padreId, alumnoId);

        const anio = await this.resolveAnio(query.anio);
        const params: unknown[] = [alumnoId, anio];
        const periodoFilter = query.periodoId
            ? `AND n.periodo_id = $${params.push(query.periodoId)}`
            : '';

        const rows = await this.dataSource.query<{
            nota_id: string;
            curso_id: string;
            curso_nombre: string;
            area: string | null;
            color: string;
            periodo_id: string;
            periodo_nombre: string;
            bimestre: number;
            anio: number;
            titulo: string;
            tipo: string;
            nota: string | null;
            observaciones: string | null;
            fecha: string | null;
        }[]>(`
            SELECT
                n.id              AS nota_id,
                c.id              AS curso_id,
                cc.nombre         AS curso_nombre,
                cc.area,
                COALESCE(c.color, cc.color, '#3B82F6') AS color,
                p.id              AS periodo_id,
                p.nombre          AS periodo_nombre,
                p.bimestre,
                p.anio,
                n.titulo,
                n.tipo,
                n.nota,
                n.observaciones,
                n.fecha
            FROM notas n
            JOIN cursos          c  ON c.id  = n.curso_id
            JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
            JOIN periodos        p  ON p.id  = n.periodo_id
            WHERE n.alumno_id = $1
              AND p.anio      = $2
              ${periodoFilter}
            ORDER BY p.bimestre ASC, cc.nombre ASC, n.fecha ASC
        `, params);

        const map = new Map<string, CursoGradesGroup>();

        for (const row of rows) {
            const key = `${row.curso_id}__${row.periodo_id}`;
            if (!map.has(key)) {
                map.set(key, {
                    curso_id: row.curso_id,
                    curso_nombre: row.curso_nombre,
                    area: row.area,
                    color: row.color,
                    periodo_id: row.periodo_id,
                    periodo_nombre: row.periodo_nombre,
                    bimestre: Number(row.bimestre),
                    anio: Number(row.anio),
                    notas: [],
                    promedio: null,
                });
            }
            map.get(key)!.notas.push({
                nota_id: row.nota_id,
                titulo: row.titulo,
                tipo: row.tipo,
                nota: row.nota != null ? parseFloat(row.nota) : null,
                observaciones: row.observaciones,
                fecha: row.fecha,
            });
        }

        for (const grupo of map.values()) {
            const conValor = grupo.notas.filter(n => n.nota != null);
            if (conValor.length > 0) {
                const sum = conValor.reduce((acc, n) => acc + n.nota!, 0);
                grupo.promedio = Math.round((sum / conValor.length) * 10) / 10;
            }
        }

        return [...map.values()];
    }

    async getChildAttendanceGeneral(
        padreId: string,
        alumnoId: string,
        query: AttendanceQueryDto,
    ): Promise<{ resumen: AttendanceSummary; detalle: AttendanceDetalle[] }> {
        await this.verifyRelation(padreId, alumnoId);

        const anio = await this.resolveAnio(query.anio);
        const params: unknown[] = [alumnoId, anio];
        const periodoFilter = query.periodoId
            ? `AND ag.periodo_id = $${params.push(query.periodoId)}`
            : '';

        const [resumen] = await this.dataSource.query<AttendanceSummary[]>(`
            SELECT
                COUNT(*)::int                                               AS total,
                COUNT(*) FILTER (WHERE ag.estado = 'asistio')::int         AS asistio,
                COUNT(*) FILTER (WHERE ag.estado = 'tardanza')::int        AS tardanza,
                COUNT(*) FILTER (WHERE ag.estado = 'justificado')::int     AS justificado,
                COUNT(*) FILTER (WHERE ag.estado = 'falta')::int           AS falta,
                CASE
                    WHEN COUNT(*) = 0 THEN NULL
                    ELSE ROUND(
                        COUNT(*) FILTER (WHERE ag.estado IN ('asistio','tardanza'))::numeric
                        * 100.0 / COUNT(*)::numeric, 1
                    )
                END AS porcentaje
            FROM asistencias_generales ag
            JOIN periodos p ON p.id = ag.periodo_id
            WHERE ag.alumno_id = $1
              AND p.anio        = $2
              ${periodoFilter}
        `, params);

        const detalle = await this.dataSource.query<AttendanceDetalle[]>(`
            SELECT
                ag.id,
                ag.fecha,
                ag.estado,
                ag.observacion,
                p.nombre   AS periodo_nombre,
                p.anio     AS periodo_anio,
                p.bimestre AS periodo_bimestre
            FROM asistencias_generales ag
            JOIN periodos p ON p.id = ag.periodo_id
            WHERE ag.alumno_id = $1
              AND p.anio        = $2
              ${periodoFilter}
            ORDER BY ag.fecha DESC
            LIMIT 120
        `, params);

        return { resumen, detalle };
    }

    async getChildSchedule(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);
        const anio = await this.resolveAnio();
        return this.dataSource.query<unknown[]>(`
            SELECT
                h.dia_semana                                AS "diaSemana",
                h.hora_inicio                               AS "horaInicio",
                h.hora_fin                                  AS "horaFin",
                cc.nombre                                   AS curso,
                h.aula,
                COALESCE(c.color, cc.color, '#3B82F6')      AS color,
                TRIM(CONCAT(
                    d.nombre, ' ', d.apellido_paterno,
                    COALESCE(' ' || d.apellido_materno, '')
                ))                                          AS docente
            FROM matriculas m
            JOIN secciones       s  ON s.id = m.seccion_id
            JOIN cursos          c  ON c.seccion_id = s.id AND c.anio = m.anio AND c.activo = TRUE
            JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
            JOIN horarios        h  ON h.curso_id = c.id
            LEFT JOIN docentes   d  ON d.id = c.docente_id
            WHERE m.alumno_id = $1
              AND m.activo     = TRUE
              AND m.anio       = $2
            ORDER BY
                CASE h.dia_semana
                    WHEN 'lunes'     THEN 1
                    WHEN 'martes'    THEN 2
                    WHEN 'miercoles' THEN 3
                    WHEN 'jueves'    THEN 4
                    WHEN 'viernes'   THEN 5
                END,
                h.hora_inicio
        `, [alumnoId, anio]);
    }

    async getChildLibretas(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);
        return this.dataSource.query<unknown[]>(`
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

    async getChildInformes(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);
        return this.dataSource.query<unknown[]>(`
            SELECT
                i.id,
                i.tipo,
                i.titulo,
                i.confidencial,
                i.finalizado_at AS "finalizadoAt",
                TRIM(CONCAT(
                    ps.nombre, ' ', ps.apellido_paterno,
                    COALESCE(' ' || ps.apellido_materno, '')
                )) AS "psicologaNombre"
            FROM informes_psicologicos i
            JOIN psicologas ps ON ps.id = i.psicologa_id
            WHERE i.alumno_id    = $1
              AND i.estado       = 'finalizado'
              AND i.confidencial = FALSE
            ORDER BY i.finalizado_at DESC
        `, [alumnoId]);
    }

    async getChildInformePdf(
        padreId: string,
        alumnoId: string,
        informeId: string,
        res: Response,
    ): Promise<void> {
        await this.verifyRelation(padreId, alumnoId);

        const [informe] = await this.dataSource.query<{
            psicologa_id: string;
            alumno_id: string;
            estado: string;
            confidencial: boolean;
        }[]>(
            `SELECT psicologa_id, alumno_id, estado, confidencial
               FROM informes_psicologicos
              WHERE id = $1`,
            [informeId],
        );

        if (!informe || informe.estado !== 'finalizado' || informe.alumno_id !== alumnoId) {
            throw new NotFoundException('Informe no disponible');
        }
        if (informe.confidencial) {
            throw new ForbiddenException('Este informe es confidencial');
        }

        const { buffer, filename } = await this.reportSvc.generateInformePdf(
            informe.psicologa_id,
            informeId,
        );

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.end(buffer);
    }

    async getChildArchivos(
        padreId: string,
        alumnoId: string,
        categoria?: 'ficha' | 'test',
    ) {
        await this.verifyRelation(padreId, alumnoId);
        return this.archivosSvc.listForPadre(alumnoId, categoria);
    }

    async getChildArchivoUrl(
        padreId: string,
        alumnoId: string,
        archivoId: string,
    ): Promise<{ url: string }> {
        await this.verifyRelation(padreId, alumnoId);
        return this.archivosSvc.resolveDownload(archivoId, {
            role: 'padre',
            userId: padreId,
        });
    }
}