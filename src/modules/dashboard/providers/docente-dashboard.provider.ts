import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SharedDashboardQueries } from '../shared/shared-dashboard.queries';
import { DocenteDashboardDto, EntregaPendienteItem } from '../dto/docente-dashboard.dto';

@Injectable()
export class DocenteDashboardProvider {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly shared: SharedDashboardQueries,
    ) { }

    async getResumen(docenteId: string): Promise<DocenteDashboardDto> {
        const [existe] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM docentes WHERE id = $1`,
            [docenteId],
        );
        if (!existe) throw new NotFoundException(`Docente no encontrado (id: ${docenteId})`);

        const [periodoActivo] = await this.db.query<{ anio: number }[]>(
            `SELECT anio FROM periodos WHERE activo = TRUE LIMIT 1`,
        );
        const anioActual = periodoActivo?.anio ?? new Date().getFullYear();

        const cursos = await this.db.query<{ id: string }[]>(
            `SELECT id
             FROM   cursos
             WHERE  docente_id = $1
               AND  activo     = TRUE
               AND  anio       = $2`,
            [docenteId, anioActual],
        );
        const cursoIds = cursos.map(c => c.id);

        const [horarioHoy, horario, entregasSinCalificar, comunicados] = await Promise.all([
            this.shared.getHorarioHoy(cursoIds),
            this.shared.getHorarioSemana(cursoIds),
            this.getEntregasSinCalificar(cursoIds),
            this.shared.getComunicados(['docentes', 'todos']),
        ]);

        return { horarioHoy, horario, entregasSinCalificar, comunicados };
    }

    private getEntregasSinCalificar(cursoIds: string[]): Promise<EntregaPendienteItem[]> {
        if (!cursoIds.length) return Promise.resolve([]);

        return this.db.query<EntregaPendienteItem[]>(
            `SELECT t.id                   AS "tareaId",
                    t.titulo               AS "tareaTitulo",
                    cc.nombre              AS "cursoNombre",
                    t.fecha_limite         AS "fechaLimite",
                    COUNT(et.id)::int      AS "totalSinCalificar"
             FROM   tareas          t
             JOIN   cursos          c  ON c.id  = t.curso_id
             JOIN   cursos_catalogo cc ON cc.id = c.catalogo_id
             JOIN   entregas_tarea  et ON et.tarea_id = t.id
                                     AND et.calificacion_final IS NULL
             WHERE  t.curso_id    = ANY($1)
               AND  t.activo      = TRUE
               AND  t.fecha_limite < NOW()
             GROUP  BY t.id, t.titulo, cc.nombre, t.fecha_limite
             HAVING COUNT(et.id) > 0
             ORDER  BY t.fecha_limite ASC
             LIMIT  10`,
            [cursoIds],
        );
    }
}