import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ComunicadoItem {
    id: string;
    titulo: string;
    contenido: string;
    fecha: Date;
}

export interface HorarioHoyItem {
    horaInicio: string;
    horaFin: string;
    aula: string | null;
    cursoNombre: string;
    color: string;
    seccionNombre: string;
    gradoNombre: string | null;
}

export interface HorarioSemanaItem extends HorarioHoyItem {
    dia: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
}

@Injectable()
export class SharedDashboardQueries {
    constructor(@InjectDataSource() private readonly db: DataSource) { }

    getComunicados(destinatarios: string[]): Promise<ComunicadoItem[]> {
        return this.db.query<ComunicadoItem[]>(
            `SELECT id,
                    titulo,
                    contenido,
                    created_at AS fecha
             FROM   comunicados
             WHERE  activo = TRUE
               AND  destinatarios && $1::text[]
             ORDER  BY created_at DESC
             LIMIT  3`,
            [destinatarios],
        );
    }

    getHorarioHoy(cursoIds: string[]): Promise<HorarioHoyItem[]> {
        if (!cursoIds.length) return Promise.resolve([]);

        const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const diaHoy = dias[new Date().getDay()];

        return this.db.query<HorarioHoyItem[]>(
            `SELECT TO_CHAR(h.hora_inicio, 'HH24:MI') AS "horaInicio",
                    TO_CHAR(h.hora_fin,    'HH24:MI') AS "horaFin",
                    h.aula,
                    cc.nombre                          AS "cursoNombre",
                    c.color,
                    s.nombre                           AS "seccionNombre",
                    g.nombre                           AS "gradoNombre"
             FROM   horarios         h
             JOIN   cursos           c  ON c.id         = h.curso_id
             JOIN   cursos_catalogo  cc ON cc.id        = c.catalogo_id
             JOIN   secciones        s  ON s.id         = c.seccion_id
             LEFT JOIN grados        g  ON g.id         = s.grado_id
             WHERE  h.curso_id  = ANY($1)
               AND  h.dia_semana = $2
               AND  c.activo    = TRUE
             ORDER  BY h.hora_inicio`,
            [cursoIds, diaHoy],
        );
    }

    getHorarioSemana(cursoIds: string[]): Promise<HorarioSemanaItem[]> {
        if (!cursoIds.length) return Promise.resolve([]);

        return this.db.query<HorarioSemanaItem[]>(
            `SELECT h.dia_semana                        AS "dia",
                    TO_CHAR(h.hora_inicio, 'HH24:MI')  AS "horaInicio",
                    TO_CHAR(h.hora_fin,    'HH24:MI')  AS "horaFin",
                    h.aula,
                    cc.nombre                           AS "cursoNombre",
                    c.color,
                    s.nombre                            AS "seccionNombre",
                    g.nombre                            AS "gradoNombre"
             FROM   horarios         h
             JOIN   cursos           c  ON c.id  = h.curso_id
             JOIN   cursos_catalogo  cc ON cc.id = c.catalogo_id
             JOIN   secciones        s  ON s.id  = c.seccion_id
             LEFT JOIN grados        g  ON g.id  = s.grado_id
             WHERE  h.curso_id = ANY($1)
               AND  c.activo   = TRUE
             ORDER  BY CASE h.dia_semana
                           WHEN 'lunes'     THEN 1
                           WHEN 'martes'    THEN 2
                           WHEN 'miercoles' THEN 3
                           WHEN 'jueves'    THEN 4
                           WHEN 'viernes'   THEN 5
                           WHEN 'sabado'    THEN 6
                           WHEN 'domingo'   THEN 7
                       END, h.hora_inicio`,
            [cursoIds],
        );
    }
}