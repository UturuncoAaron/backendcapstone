import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SharedDashboardQueries } from '../shared/shared-dashboard.queries.js';
import { StaffDashboardDto, SeccionAsistenciaItem } from '../dto/staff-dashboard.dto.js';

@Injectable()
export class StaffDashboardProvider {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly shared: SharedDashboardQueries,
    ) { }

    async getResumen(staffId: string): Promise<StaffDashboardDto> {
        const [existe] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM staff WHERE id = $1`,
            [staffId],
        );
        if (!existe) throw new NotFoundException(`Staff no encontrado (id: ${staffId})`);

        const [seccionesHoy, comunicados] = await Promise.all([
            this.getSeccionesHoy(),
            this.shared.getComunicados(['todos']),
        ]);

        return { seccionesHoy, comunicados };
    }

    private getSeccionesHoy(): Promise<SeccionAsistenciaItem[]> {
        return this.db.query<SeccionAsistenciaItem[]>(
            `SELECT s.id                                                              AS "seccionId",
                    s.nombre                                                          AS "seccionNombre",
                    g.nombre                                                          AS "gradoNombre",
                    COUNT(DISTINCT m.alumno_id)::int                                  AS "totalAlumnos",
                    (COUNT(DISTINCT ag.alumno_id) > 0)                               AS registrada,
                    COUNT(DISTINCT ag.id) FILTER (WHERE ag.estado = 'falta')::int    AS "totalFaltas",
                    COUNT(DISTINCT ag.id) FILTER (WHERE ag.estado = 'tardanza')::int AS "totalTardanzas"
             FROM   secciones s
             JOIN   grados    g  ON g.id = s.grado_id
             JOIN   periodos  p  ON p.activo = TRUE
                                AND (NOW() AT TIME ZONE 'America/Lima')::date BETWEEN p.fecha_inicio AND p.fecha_fin
             JOIN   matriculas m ON m.seccion_id = s.id
                                AND m.anio       = p.anio
                                AND m.activo     = TRUE
             LEFT JOIN asistencias_generales ag
                    ON ag.seccion_id = s.id
                   AND ag.fecha      = (NOW() AT TIME ZONE 'America/Lima')::date
                   AND ag.periodo_id = p.id
             WHERE  s.activo = TRUE
             GROUP  BY s.id, s.nombre, g.nombre, g.orden
             ORDER  BY g.orden, s.nombre`,
        );
    }
}