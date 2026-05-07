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

        return { hijos, citasProximas, comunicados, libretas };
    }

    private getHijos(padreId: string): Promise<HijoItem[]> {
        return this.db.query<HijoItem[]>(
            `SELECT a.id                AS "alumnoId",
              a.nombre,
              a.apellido_paterno  AS "apellidoPaterno",
              g.nombre            AS grado,
              s.nombre            AS seccion
       FROM   padre_alumno pa
       JOIN   alumnos   a ON a.id  = pa.alumno_id
       JOIN   matriculas m ON m.alumno_id = a.id AND m.activo = TRUE
       JOIN   secciones  s ON s.id = m.seccion_id
       JOIN   grados     g ON g.id = s.grado_id
       JOIN   periodos   p ON p.id = m.periodo_id AND p.activo = TRUE
       WHERE  pa.padre_id = $1`,
            [padreId],
        );
    }

    private getCitasProximas(padreId: string): Promise<CitaItem[]> {
        return this.db.query<CitaItem[]>(
            `SELECT ci.id,
            ci.tipo,
            ci.modalidad,
            ci.fecha_hora       AS "fechaHora",
            ci.estado,
            ci.alumno_id        AS "alumnoId",
            CONCAT(a.nombre, ' ', a.apellido_paterno) AS "alumnoNombre",
            -- El convocado puede ser docente, admin o psicologa
            -- Buscamos el nombre en cada tabla especializada
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

    private getLibretas(padreId: string): Promise<LibretaItem[]> {
        // Obtiene libretas de todos los hijos del padre
        return this.db.query<LibretaItem[]>(
            `SELECT l.id,
              p.nombre   AS "periodoNombre",
              l.storage_key AS "storageKey",
              l.created_at  AS "creadaEn"
       FROM   libretas      l
       JOIN   periodos       p  ON p.id      = l.periodo_id
       JOIN   padre_alumno   pa ON pa.alumno_id = l.cuenta_id
       WHERE  pa.padre_id = $1
         AND  l.tipo      = 'alumno'
       ORDER  BY l.created_at DESC
       LIMIT  5`,
            [padreId],
        );
    }
}