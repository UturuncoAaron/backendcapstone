import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SharedDashboardQueries } from '../shared/shared-dashboard.queries';
import {
    PsicologaDashboardDto, CitaHoyItem, AlumnoSeguimientoItem,
} from '../dto/psicologa-dashboard.dto';

@Injectable()
export class PsicologaDashboardProvider {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly shared: SharedDashboardQueries,
    ) { }

    async getResumen(psicologaId: string): Promise<PsicologaDashboardDto> {
        const [existe] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM psicologas WHERE id = $1`,
            [psicologaId],
        );
        if (!existe) throw new NotFoundException(`Psicóloga no encontrada (id: ${psicologaId})`);

        const [citasHoy, alumnosEnSeguimiento, comunicados] = await Promise.all([
            this.getCitasHoy(psicologaId),
            this.getAlumnosSeguimiento(psicologaId),
            this.shared.getComunicados(['todos']),
        ]);

        return { citasHoy, alumnosEnSeguimiento, comunicados };
    }

    private getCitasHoy(psicologaId: string): Promise<CitaHoyItem[]> {
        return this.db.query<CitaHoyItem[]>(
            `SELECT ci.id,
              ci.tipo,
              ci.modalidad,
              ci.fecha_hora    AS "fechaHora",
              ci.duracion_min  AS "duracionMin",
              ci.estado,
              CONCAT(a.nombre, ' ', a.apellido_paterno) AS "alumnoNombre",
              a.id                                       AS "alumnoId"
       FROM   citas  ci
       JOIN   alumnos a ON a.id = ci.alumno_id
       WHERE  ci.convocado_por_id = $1
         AND  ci.estado IN ('pendiente', 'confirmada')
         AND  DATE(ci.fecha_hora AT TIME ZONE 'America/Lima') = CURRENT_DATE
       ORDER  BY ci.fecha_hora ASC`,
            [psicologaId],
        );
    }

    private getAlumnosSeguimiento(psicologaId: string): Promise<AlumnoSeguimientoItem[]> {
        return this.db.query<AlumnoSeguimientoItem[]>(
            `SELECT a.id               AS "alumnoId",
              a.nombre,
              a.apellido_paterno AS "apellidoPaterno",
              g.nombre           AS grado,
              s.nombre           AS seccion,
              pa_rel.desde
       FROM   psicologa_alumno pa_rel
       JOIN   alumnos   a ON a.id  = pa_rel.alumno_id
       JOIN   matriculas m ON m.alumno_id = a.id AND m.activo = TRUE
       JOIN   secciones  s ON s.id = m.seccion_id
       JOIN   grados     g ON g.id = s.grado_id
       JOIN   periodos   p ON p.id = m.periodo_id AND p.activo = TRUE
       WHERE  pa_rel.psicologa_id = $1
         AND  pa_rel.activo       = TRUE
       ORDER  BY a.apellido_paterno, a.nombre`,
            [psicologaId],
        );
    }
}