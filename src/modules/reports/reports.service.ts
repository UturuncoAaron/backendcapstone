import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueryReportDto } from './dto/query-report.dto.js';
import { AcademicReportsService } from './academic/academic-reports.service.js';
import { AttendanceReportsService } from './attendance/attendance-reports.service.js';
import { SectionReportService } from './section/section-report.service.js';
import { TeacherAttendanceService } from './teacher-attendance/teacher-attendance.service.js';
import type { AuthUser } from '../auth/types/auth-user.js';

export interface GradeRow {
    alumno_id: string;
    numero_documento: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string;
    grado: string;
    seccion: string;
    curso: string | null;
    bimestre: number;
    actividad: string | null;
    tipo: string | null;
    nota: number | null;
    escala: string | null;
    asistencias_generales_presente: number;
    asistencias_generales_falta: number;
    asistencias_curso_presente: number;
    asistencias_curso_falta: number;
}

@Injectable()
export class ReportsService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly academicSvc: AcademicReportsService,
        private readonly attendanceSvc: AttendanceReportsService,
        private readonly sectionSvc: SectionReportService,
        private readonly teacherAttendanceSvc: TeacherAttendanceService,
    ) { }

    async generateConsolidatedData(user: AuthUser, dto: QueryReportDto): Promise<any> {
        const targetAnio = await this.resolveTargetYear(dto.anio);

        if (dto.fecha_inicio && dto.fecha_fin) {
            this.validateDateRangeForYear(dto.fecha_inicio, dto.fecha_fin, targetAnio);
        }

        switch (dto.scope) {
            case 'academic_general':
            case 'student_individual':
                return this.getGradesReport(dto);

            case 'section_summary':
                if (!dto.seccion_id || !dto.periodo_id) {
                    throw new BadRequestException('seccion_id y periodo_id son requeridos para este reporte');
                }
                return this.sectionSvc.getSeccionResumen(user, dto.seccion_id, dto.periodo_id, dto.umbral ?? 11);

            case 'teacher_attendance_range':
                if (!dto.fecha_inicio || !dto.fecha_fin) {
                    throw new BadRequestException('fecha_inicio y fecha_fin son requeridas');
                }
                return this.attendanceSvc.getResumenDocentesRango(dto.fecha_inicio, dto.fecha_fin, dto.cuenta_id);

            case 'staff_attendance_range':
                if (!dto.fecha_inicio || !dto.fecha_fin) {
                    throw new BadRequestException('fecha_inicio y fecha_fin son requeridas');
                }
                return this.attendanceSvc.getResumenStaffRango(dto.fecha_inicio, dto.fecha_fin, dto.cuenta_id);

            case 'course_ranking':
                if (!dto.curso_id || !dto.periodo_id) {
                    throw new BadRequestException('curso_id y periodo_id son requeridos');
                }
                return this.academicSvc.getPromediosPorCurso(user, dto.curso_id, dto.periodo_id);

            default:
                throw new BadRequestException('Ámbito de reporte no soportado o inválido');
        }
    }

    async getGradesReport(query: QueryReportDto): Promise<GradeRow[]> {
        const targetAnio = await this.resolveTargetYear(query.anio);
        const conditions: string[] = ['m.activo = true', 'p.anio = $1'];
        const params: any[] = [targetAnio];
        let paramIndex = 2;

        if (query.periodo_id) {
            conditions.push(`p.id = $${paramIndex++}`);
            params.push(query.periodo_id);
        }
        if (query.bimestre) {
            conditions.push(`p.bimestre = $${paramIndex++}`);
            params.push(query.bimestre);
        }
        if (!query.periodo_id && !query.bimestre) {
            conditions.push(`p.activo = TRUE`);
        }
        if (query.grado_id) {
            conditions.push(`g.id = $${paramIndex++}`);
            params.push(query.grado_id);
        }
        if (query.seccion_id) {
            conditions.push(`s.id = $${paramIndex++}`);
            params.push(query.seccion_id);
        }
        if (query.curso_id) {
            conditions.push(`c.id = $${paramIndex++}`);
            params.push(query.curso_id);
        }
        if (query.alumno_id) {
            conditions.push(`a.id = $${paramIndex++}`);
            params.push(query.alumno_id);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        const sql = `
            SELECT
                a.id                    AS alumno_id,
                cu.numero_documento,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                g.nombre                AS grado,
                s.nombre                AS seccion,
                cc.nombre               AS curso,
                p.bimestre,
                n.titulo                AS actividad,
                n.tipo,
                n.nota,
                CASE
                    WHEN n.nota IS NULL  THEN NULL
                    WHEN n.nota >= 18   THEN 'AD'
                    WHEN n.nota >= 14   THEN 'A'
                    WHEN n.nota >= 11   THEN 'B'
                    ELSE                     'C'
                END                     AS escala,
                COUNT(DISTINCT ag.id) FILTER (WHERE ag.estado IN ('asistio', 'tardanza'))::int AS asistencias_generales_presente,
                COUNT(DISTINCT ag.id) FILTER (WHERE ag.estado = 'falta')::int AS asistencias_generales_falta,
                COUNT(DISTINCT ac.id) FILTER (WHERE ac.estado IN ('asistio', 'tardanza'))::int AS asistencias_curso_presente,
                COUNT(DISTINCT ac.id) FILTER (WHERE ac.estado = 'falta')::int AS asistencias_curso_falta
            FROM   periodos    p
            JOIN   matriculas  m  ON m.anio = p.anio
            JOIN   alumnos     a  ON a.id   = m.alumno_id
            JOIN   cuentas     cu ON cu.id  = a.id
            JOIN   secciones   s  ON s.id   = m.seccion_id
            JOIN   grados      g  ON g.id   = s.grado_id
            LEFT JOIN cursos   c  ON c.seccion_id = m.seccion_id AND c.activo = TRUE
            LEFT JOIN cursos_catalogo cc ON cc.id = c.catalogo_id
            LEFT JOIN notas    n  ON n.alumno_id  = m.alumno_id
                                 AND n.curso_id   = c.id
                                 AND n.periodo_id = p.id
            LEFT JOIN asistencias_generales ag ON ag.alumno_id = m.alumno_id 
                                              AND ag.periodo_id = p.id
            LEFT JOIN asistencias_curso ac ON ac.alumno_id = m.alumno_id 
                                          AND ac.curso_id = c.id
                                          AND ac.periodo_id = p.id
            ${whereClause}
            GROUP BY a.id, cu.numero_documento, g.id, s.id, cc.id, p.id, n.id
            ORDER BY g.orden, s.nombre, a.apellido_paterno, a.nombre, cc.nombre
        `;

        return this.dataSource.query(sql, params);
    }

    buildCsv(rows: GradeRow[]): string {
        const headers = [
            'DNI/Documento',
            'Apellido Paterno',
            'Apellido Materno',
            'Nombre',
            'Grado',
            'Sección',
            'Curso',
            'Bimestre',
            'Actividad',
            'Tipo',
            'Nota',
            'Escala',
            'Asist. General (Asistió/Tardanza)',
            'Asist. General (Faltas)',
            'Asist. Curso (Asistió/Tardanza)',
            'Asist. Curso (Faltas)'
        ];

        const escapeCell = (value: any): string => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvRows = rows.map(row => [
            row.numero_documento,
            row.apellido_paterno,
            row.apellido_materno ?? '',
            row.nombre,
            row.grado,
            row.seccion,
            row.curso ?? '',
            row.bimestre ?? '',
            row.actividad ?? '',
            row.tipo ?? '',
            row.nota ?? '',
            row.escala ?? '',
            row.asistencias_generales_presente,
            row.asistencias_generales_falta,
            row.asistencias_curso_presente,
            row.asistencias_curso_falta
        ].map(escapeCell).join(','));

        return [headers.join(','), ...csvRows].join('\n');
    }

    private async resolveTargetYear(requestedAnio?: number): Promise<number> {
        if (requestedAnio) {
            const exists = await this.dataSource.query(`SELECT 1 FROM anios_lectivos WHERE anio = $1 LIMIT 1`, [requestedAnio]);
            if (!exists.length) {
                throw new NotFoundException(`El año escolar ${requestedAnio} no está registrado`);
            }
            return requestedAnio;
        }

        const activeYear = await this.dataSource.query(
            `SELECT anio FROM anios_lectivos WHERE estado = 'en_curso' LIMIT 1`
        );

        if (!activeYear.length) {
            throw new BadRequestException('No existe un año lectivo actualmente activo en el sistema');
        }

        return activeYear[0].anio;
    }

    private validateDateRangeForYear(inicio: string, fin: string, expectedAnio: number): void {
        const yearInicio = new Date(inicio).getUTCFullYear();
        const yearFin = new Date(fin).getUTCFullYear();

        if (yearInicio !== expectedAnio || yearFin !== expectedAnio) {
            throw new BadRequestException(
                `El rango de fechas proporcionado no corresponde al año lectivo seleccionado: ${expectedAnio}`
            );
        }
    }
}