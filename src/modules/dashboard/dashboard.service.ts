import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AlumnoDashboardDto } from './dto/alumno-dashboard.dto.js';

@Injectable()
export class DashboardService {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
    ) { }

    async getAlumnoResumen(alumnoId: string): Promise<AlumnoDashboardDto> {
        if (!alumnoId) {
            throw new BadRequestException('alumnoId es requerido');
        }

        // Verificar que el alumno existe
        const [alumno] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM alumnos WHERE id = $1`,
            [alumnoId],
        );

        if (!alumno) {
            throw new NotFoundException(`Alumno no encontrado (id: ${alumnoId})`);
        }

        // Ejecutar las 3 queries en paralelo
        const [horario, tareasPendientes, comunicados] = await Promise.all([
            this.getHorario(alumnoId),
            this.getTareasPendientes(alumnoId),
            this.getComunicados(),
        ]);

        return { horario, tareasPendientes, comunicados };
    }

    // ────────────────────────────────────────────────────────────────
    // Horario semanal completo via matrícula activa en periodo activo
    // ────────────────────────────────────────────────────────────────
    private async getHorario(alumnoId: string) {
        return this.db.query(
            `SELECT
         h.dia_semana                        AS dia,
         TO_CHAR(h.hora_inicio, 'HH24:MI')  AS "horaInicio",
         TO_CHAR(h.hora_fin,    'HH24:MI')  AS "horaFin",
         h.aula,
         c.nombre                            AS "cursoNombre",
         c.color,
         CONCAT(d.nombre, ' ', d.apellido_paterno) AS "docenteNombre"
       FROM   matriculas m
       JOIN   periodos  p  ON p.id         = m.periodo_id  AND p.activo = TRUE
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
           WHEN 'lunes'     THEN 1
           WHEN 'martes'    THEN 2
           WHEN 'miercoles' THEN 3
           WHEN 'jueves'    THEN 4
           WHEN 'viernes'   THEN 5
         END,
         h.hora_inicio`,
            [alumnoId],
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Tareas activas sin entregar, ordenadas por urgencia
    // ────────────────────────────────────────────────────────────────
    private async getTareasPendientes(alumnoId: string) {
        return this.db.query(
            `SELECT
         t.id,
         t.titulo,
         t.tipo,
         t.fecha_limite         AS "fechaLimite",
         c.nombre               AS "cursoNombre"
       FROM   matriculas      m
       JOIN   periodos        p   ON p.id         = m.periodo_id  AND p.activo = TRUE
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
       ORDER BY t.fecha_limite ASC
       LIMIT  10`,
            [alumnoId],
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Últimos 3 comunicados dirigidos a alumnos o a todos
    // ────────────────────────────────────────────────────────────────
    private async getComunicados() {
        return this.db.query(
            `SELECT
         id,
         titulo,
         contenido,
         created_at AS fecha
       FROM  comunicados
       WHERE activo       = TRUE
         AND destinatario IN ('todos', 'alumnos')
       ORDER BY created_at DESC
       LIMIT 3`,
        );
    }
}