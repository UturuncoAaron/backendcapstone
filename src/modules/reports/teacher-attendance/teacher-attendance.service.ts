import {
    Injectable,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
    SQL_REPORTE_DIARIO_DOCENTES,
    SQL_REPORTE_RANGO_DOCENTES,
    SQL_RESUMEN_DOCENTES_RANGO,
    SQL_ALERTAS_AUSENCIAS_DOCENTE,
} from '../queries/reports.queries.js';
import type {
    AsistenciaDocenteDiariaRow,
    ResumenAsistenciaDocenteRow,
    AlertaAusenciaDocenteRow,
} from '../types/reports.types.js';

interface AsistenciaDocenteRangoRow extends AsistenciaDocenteDiariaRow {
    fecha: string;
    grado_orden: number;
}

@Injectable()
export class TeacherAttendanceService {
    constructor(@InjectDataSource() private readonly ds: DataSource) { }

    async getReporteDiario(user: AuthUser, fecha: string): Promise<AsistenciaDocenteDiariaRow[]> {
        this.assertCanViewReports(user);
        return this.ds.query(SQL_REPORTE_DIARIO_DOCENTES, [fecha]);
    }

    async getReporteRango(
        user: AuthUser, fechaInicio: string, fechaFin: string,
    ): Promise<AsistenciaDocenteRangoRow[]> {
        this.assertCanViewReports(user);
        this.assertRangoFechas(fechaInicio, fechaFin);
        return this.ds.query(SQL_REPORTE_RANGO_DOCENTES, [fechaInicio, fechaFin]);
    }

    async getResumenRango(
        user: AuthUser, fechaInicio: string, fechaFin: string,
    ): Promise<ResumenAsistenciaDocenteRow[]> {
        this.assertCanViewReports(user);
        this.assertRangoFechas(fechaInicio, fechaFin);
        return this.ds.query(SQL_RESUMEN_DOCENTES_RANGO, [fechaInicio, fechaFin, null]);
    }

    async getAlertas(
        user: AuthUser, fechaInicio: string, fechaFin: string, limit = 10,
    ): Promise<AlertaAusenciaDocenteRow[]> {
        this.assertCanViewReports(user);
        this.assertRangoFechas(fechaInicio, fechaFin);
        return this.ds.query(SQL_ALERTAS_AUSENCIAS_DOCENTE, [fechaInicio, fechaFin, limit]);
    }

    private assertCanViewReports(user: AuthUser): void {
        if (user.rol !== 'staff' && user.rol !== 'admin') {
            throw new ForbiddenException('Acceso restringido a staff y administradores');
        }
    }

    private assertRangoFechas(inicio: string, fin: string): void {
        if (new Date(inicio) > new Date(fin)) {
            throw new BadRequestException('fecha_inicio debe ser anterior o igual a fecha_fin');
        }
        const diffDias = (new Date(fin).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24);
        if (diffDias > 366) {
            throw new BadRequestException('El rango máximo permitido es 1 año (366 días)');
        }
    }
}