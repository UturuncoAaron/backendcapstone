import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
    SQL_SECCION_INFO,
    SQL_TOP_Y_RIESGO,
    SQL_SECCION_NOTAS,
    SQL_RESUMEN_ASISTENCIA,
    SQL_TOP_INASISTENTES,
    SQL_ENTREGAS_POR_TAREA,
} from '../queries/reports.queries.js';
import type {
    SeccionInfo,
    SeccionResumenResponse,
    TopRiesgoRow,
    SeccionNotasRow,
    ResumenAsistenciaRow,
    TopInasistenteRow,
    EntregasTareaRow,
} from '../types/reports.types.js';

/**
 * SectionReportService
 *
 * Reporte maestro de sección: combina notas + asistencia + tareas
 * en un solo endpoint con consultas paralelas (Promise.all).
 *
 * Acceso:
 *   - admin    → cualquier sección
 *   - docente  → solo secciones donde es tutor
 *   - auxiliar → lectura de asistencia (sin notas ni tareas si se requiere)
 *
 * Por qué Promise.all y no una mega-query:
 *   - Cada sub-query afecta tablas distintas → no se beneficia de un JOIN
 *   - Queries independientes se ejecutan en paralelo en el pool de PG
 *   - Más fácil testear, cachear y escalar independientemente
 *   - Mantenibilidad: cambiar la query de notas no afecta la de asistencia
 */
@Injectable()
export class SectionReportService {
    constructor(@InjectDataSource() private readonly ds: DataSource) { }

    /**
     * Reporte maestro: devuelve todo lo necesario para la UI de la sección.
     * Las 6 queries se lanzan en paralelo.
     */
    async getSeccionResumen(
        user: AuthUser,
        seccionId: string,
        periodoId: string,
        umbral = 11,
        topInasistentesLimit = 10,
    ): Promise<SeccionResumenResponse> {
        await this.assertCanViewSeccion(user, seccionId);

        // Obtener metadata de sección y periodo en paralelo con los datos
        const [
            seccionRows,
            periodoRows,
            ranking,
            notasPorCurso,
            resumenAsistencia,
            topInasistentes,
            entregasPorTarea,
        ] = await Promise.all([
            this.ds.query(SQL_SECCION_INFO, [seccionId]),
            this.ds.query(`SELECT id, nombre, anio, bimestre,
                   fecha_inicio::text, fecha_fin::text, activo
                   FROM periodos WHERE id = $1`, [periodoId]),
            this.ds.query(SQL_TOP_Y_RIESGO, [seccionId, periodoId, umbral]) as Promise<TopRiesgoRow[]>,
            this.ds.query(SQL_SECCION_NOTAS, [seccionId, periodoId]) as Promise<SeccionNotasRow[]>,
            this.ds.query(SQL_RESUMEN_ASISTENCIA, [seccionId, periodoId]) as Promise<ResumenAsistenciaRow[]>,
            this.ds.query(SQL_TOP_INASISTENTES, [seccionId, periodoId, topInasistentesLimit]) as Promise<TopInasistenteRow[]>,
            this.ds.query(SQL_ENTREGAS_POR_TAREA, [seccionId, periodoId]) as Promise<EntregasTareaRow[]>,
        ]);

        if (seccionRows.length === 0) {
            throw new NotFoundException(`Sección ${seccionId} no encontrada`);
        }
        if (periodoRows.length === 0) {
            throw new NotFoundException(`Periodo ${periodoId} no encontrado`);
        }

        return {
            seccion: seccionRows[0] as SeccionInfo,
            periodo: periodoRows[0],
            ranking,
            notas_por_curso: notasPorCurso,
            resumen_asistencia: resumenAsistencia,
            top_inasistentes: topInasistentes,
            entregas_por_tarea: entregasPorTarea,
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // Autorización
    // ─────────────────────────────────────────────────────────────────────

    private async assertCanViewSeccion(
        user: AuthUser,
        seccionId: string,
    ): Promise<void> {
        if (user.rol === 'admin') return;

        if (user.rol === 'docente') {
            const rows: unknown[] = await this.ds.query(
                `SELECT 1 FROM secciones WHERE id = $1 AND tutor_id = $2 LIMIT 1`,
                [seccionId, user.id],
            );
            if (rows.length > 0) return;
            throw new ForbiddenException(
                'Solo puedes ver el reporte de tu sección como tutor',
            );
        }

        if (user.rol === 'auxiliar') {
            // Auxiliar puede ver asistencia pero no notas ni tareas.
            // El controller decide qué tabs mostrar por rol.
            return;
        }

        throw new ForbiddenException('Sin acceso a reportes de sección');
    }
}