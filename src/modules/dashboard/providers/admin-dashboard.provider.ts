import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminDashboardDto, ContadoresItem, AlertaOperativaItem } from '../dto/admin-dashboard.dto';

@Injectable()
export class AdminDashboardProvider {
    constructor(@InjectDataSource() private readonly db: DataSource) { }

    async getResumen(): Promise<AdminDashboardDto> {
        const [contadores, alertas] = await Promise.all([
            this.getContadores(),
            this.getAlertas(),
        ]);
        return { contadores, alertas };
    }

    private async getContadores(): Promise<ContadoresItem> {
        const [row] = await this.db.query<ContadoresItem[]>(
            `SELECT
         (SELECT COUNT(*) FROM alumnos   a JOIN cuentas c ON c.id = a.id WHERE c.activo = TRUE)::int AS "totalAlumnos",
         (SELECT COUNT(*) FROM docentes  d JOIN cuentas c ON c.id = d.id WHERE c.activo = TRUE)::int AS "totalDocentes",
         (SELECT COUNT(*) FROM padres    p JOIN cuentas c ON c.id = p.id WHERE c.activo = TRUE)::int AS "totalPadres",
         (SELECT COUNT(*) FROM auxiliares x JOIN cuentas c ON c.id = x.id WHERE c.activo = TRUE)::int AS "totalAuxiliares"`,
        );
        return row;
    }

    private async getAlertas(): Promise<AlertaOperativaItem[]> {
        const [sinDocente, sinHorario, contratosVencer] = await Promise.all([
            this.db.query<{ total: number }[]>(
                `SELECT COUNT(*)::int AS total
       FROM   cursos c
       JOIN   periodos p ON p.id = c.periodo_id AND p.activo = TRUE
       WHERE  c.activo = TRUE AND c.docente_id IS NULL`,
            ),
            this.db.query<{ total: number }[]>(
                `SELECT COUNT(*)::int AS total
       FROM   cursos c
       JOIN   periodos p ON p.id = c.periodo_id AND p.activo = TRUE
       WHERE  c.activo = TRUE
         AND  NOT EXISTS (SELECT 1 FROM horarios h WHERE h.curso_id = c.id)`,
            ),
            this.db.query<{ total: number }[]>(
                `SELECT COUNT(*)::int AS total
       FROM   docentes d
       WHERE  d.tipo_contrato   = 'contratado'
         AND  d.estado_contrato = 'activo'
         AND  d.fecha_fin_contrato BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
            ),
        ]);

        const alertas: AlertaOperativaItem[] = [];

        if (sinDocente[0].total > 0)
            alertas.push({
                tipo: 'sin_docente',
                descripcion: `${sinDocente[0].total} curso${sinDocente[0].total > 1 ? 's' : ''} sin docente asignado`,
                referencia: 'cursos',
            });

        if (sinHorario[0].total > 0)
            alertas.push({
                tipo: 'sin_horario',
                descripcion: `${sinHorario[0].total} curso${sinHorario[0].total > 1 ? 's' : ''} sin horario cargado`,
                referencia: 'horarios',
            });

        if (contratosVencer[0].total > 0)
            alertas.push({
                tipo: 'contrato_por_vencer',
                descripcion: `${contratosVencer[0].total} contrato${contratosVencer[0].total > 1 ? 's' : ''} vence${contratosVencer[0].total === 1 ? ' próximamente' : 'n en los próximos 30 días'}`,
                referencia: 'docentes',
            });

        return alertas;
    }
}