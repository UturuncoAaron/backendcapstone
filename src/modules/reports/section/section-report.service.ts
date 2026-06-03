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

@Injectable()
export class SectionReportService {
    constructor(@InjectDataSource() private readonly ds: DataSource) { }

    async getSeccionResumen(
        user: AuthUser,
        seccionId: string,
        periodoId: string,
        umbral = 11,
        topInasistentesLimit = 10,
    ): Promise<SeccionResumenResponse> {
        await this.assertCanViewSeccion(user, seccionId);

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
            this.ds.query(
                `SELECT id, nombre, anio, bimestre,
                        fecha_inicio::text, fecha_fin::text, activo
                   FROM periodos WHERE id = $1`,
                [periodoId],
            ),
            this.ds.query(SQL_TOP_Y_RIESGO, [seccionId, periodoId, umbral]) as Promise<TopRiesgoRow[]>,
            this.ds.query(SQL_SECCION_NOTAS, [seccionId, periodoId]) as Promise<SeccionNotasRow[]>,
            this.ds.query(SQL_RESUMEN_ASISTENCIA, [seccionId, periodoId]) as Promise<ResumenAsistenciaRow[]>,
            this.ds.query(SQL_TOP_INASISTENTES, [seccionId, periodoId, topInasistentesLimit]) as Promise<TopInasistenteRow[]>,
            this.ds.query(SQL_ENTREGAS_POR_TAREA, [seccionId, periodoId]) as Promise<EntregasTareaRow[]>,
        ]);

        if (!seccionRows.length) throw new NotFoundException(`Sección ${seccionId} no encontrada`);
        if (!periodoRows.length) throw new NotFoundException(`Periodo ${periodoId} no encontrado`);

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

    private async assertCanViewSeccion(user: AuthUser, seccionId: string): Promise<void> {
        if (user.rol === 'admin') return;

        if (user.rol === 'docente') {
            const rows: unknown[] = await this.ds.query(
                `SELECT 1 FROM secciones WHERE id = $1 AND tutor_id = $2 LIMIT 1`,
                [seccionId, user.id],
            );
            if (rows.length > 0) return;
            throw new ForbiddenException('Solo puedes ver el reporte de tu sección como tutor');
        }

        if (user.rol === 'staff') return;

        throw new ForbiddenException('Sin acceso a reportes de sección');
    }
}