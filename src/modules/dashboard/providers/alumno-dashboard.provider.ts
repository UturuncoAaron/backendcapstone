import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SharedDashboardQueries } from '../shared/shared-dashboard.queries';
import { AlumnoDashboardDto, HorarioItem, TareaPendienteItem } from '../dto/alumno-dashboard.dto';

@Injectable()
export class AlumnoDashboardProvider {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly shared: SharedDashboardQueries,
    ) { }

    async getResumen(alumnoId: string): Promise<AlumnoDashboardDto> {
        const [existe] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM alumnos WHERE id = $1`,
            [alumnoId],
        );
        if (!existe) throw new NotFoundException(`Alumno no encontrado (id: ${alumnoId})`);

        const [horario, tareasPendientes, comunicados] = await Promise.all([
            this.getHorarioSemanal(alumnoId),
            this.getTareasPendientes(alumnoId),
            this.shared.getComunicados(['alumnos', 'todos']),
        ]);

        return { horario, tareasPendientes, comunicados };
    }

    private getHorarioSemanal(alumnoId: string): Promise<HorarioItem[]> {
        return this.db.query<HorarioItem[]>(
            `SELECT h.dia_semana                        AS dia,
              TO_CHAR(h.hora_inicio, 'HH24:MI')  AS "horaInicio",
              TO_CHAR(h.hora_fin,    'HH24:MI')  AS "horaFin",
              h.aula,
              c.nombre                            AS "cursoNombre",
              c.color,
              CONCAT(d.nombre, ' ', d.apellido_paterno) AS "docenteNombre"
       FROM   matriculas m
       JOIN   periodos  p  ON p.id         = m.periodo_id AND p.activo = TRUE
       JOIN   secciones s  ON s.id         = m.seccion_id
       JOIN   cursos    c  ON c.seccion_id = s.id
                          AND c.periodo_id = m.periodo_id
                          AND c.activo     = TRUE
       JOIN   horarios  h  ON h.curso_id   = c.id
       LEFT JOIN docentes d ON d.id        = c.docente_id
       WHERE  m.alumno_id = $1
         AND  m.activo    = TRUE
       ORDER BY
         CASE h.dia_semana
           WHEN 'lunes'     THEN 1 WHEN 'martes'    THEN 2
           WHEN 'miercoles' THEN 3 WHEN 'jueves'    THEN 4
           WHEN 'viernes'   THEN 5 END,
         h.hora_inicio`,
            [alumnoId],
        );
    }

    private getTareasPendientes(alumnoId: string): Promise<TareaPendienteItem[]> {
        return this.db.query<TareaPendienteItem[]>(
            `SELECT t.id,
              t.titulo,
              t.tipo,
              t.fecha_limite         AS "fechaLimite",
              c.nombre               AS "cursoNombre"
       FROM   matriculas      m
       JOIN   periodos        p   ON p.id         = m.periodo_id AND p.activo = TRUE
       JOIN   secciones       s   ON s.id         = m.seccion_id
       JOIN   cursos          c   ON c.seccion_id = s.id
                                 AND c.periodo_id = m.periodo_id
                                 AND c.activo     = TRUE
       JOIN   tareas          t   ON t.curso_id   = c.id
                                 AND t.activo     = TRUE
                                 AND t.fecha_limite > NOW()
       LEFT JOIN entregas_tarea et ON et.tarea_id  = t.id
                                  AND et.alumno_id = $1
       WHERE  m.alumno_id = $1
         AND  m.activo    = TRUE
         AND  et.id IS NULL
       ORDER  BY t.fecha_limite ASC
       LIMIT  10`,
            [alumnoId],
        );
    }
}