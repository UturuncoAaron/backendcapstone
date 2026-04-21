import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueryReportDto } from './dto/query-report.dto.js';

// Exportar la interfaz para que el controller pueda usarla
export interface GradeRow {
    alumno_id: string;
    numero_documento: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string;
    grado: string;
    seccion: string;
    curso: string;
    bimestre: number;
    nota_examenes: number | null;
    nota_tareas: number | null;
    nota_participacion: number | null;
    nota_final: number | null;
    escala: string | null;
}

@Injectable()
export class ReportsService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) { }

    // GET /api/admin/reports/grades — datos en JSON (para preview)
    async getGradesReport(query: QueryReportDto): Promise<GradeRow[]> {
        const conditions: string[] = ['m.activo = true'];
        const params: any[] = [];
        let paramIndex = 1;

        if (query.periodo_id) {
            conditions.push(`p.id = $${paramIndex++}`);
            params.push(query.periodo_id);
        }

        if (query.bimestre) {
            conditions.push(`n.bimestre = $${paramIndex++}`);
            params.push(query.bimestre);
        }

        if (query.grado_id) {
            conditions.push(`g.id = $${paramIndex++}`);
            params.push(query.grado_id);
        }

        if (query.seccion_id) {
            conditions.push(`s.id = $${paramIndex++}`);
            params.push(query.seccion_id);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        const sql = `
            SELECT
                u.id                    AS alumno_id,
                u.numero_documento,
                u.nombre,
                u.apellido_paterno,
                u.apellido_materno,
                g.nombre                AS grado,
                s.nombre                AS seccion,
                c.nombre                AS curso,
                COALESCE(n.bimestre, $${paramIndex}) AS bimestre,
                n.nota_examenes,
                n.nota_tareas,
                n.nota_participacion,
                n.nota_final,
                n.escala
            FROM matriculas m
            JOIN usuarios u   ON u.id = m.alumno_id
            JOIN secciones s  ON s.id = m.seccion_id
            JOIN grados g     ON g.id = s.grado_id
            JOIN periodos p   ON p.id = m.periodo_id
            LEFT JOIN cursos c ON c.seccion_id = m.seccion_id
                              AND c.periodo_id = m.periodo_id
            LEFT JOIN notas n  ON n.alumno_id = m.alumno_id
                              AND n.curso_id = c.id
                              AND n.periodo_id = m.periodo_id
                              AND ($${paramIndex} IS NULL OR n.bimestre = $${paramIndex})
            ${whereClause}
            ORDER BY
                g.orden ASC,
                s.nombre ASC,
                u.apellido_paterno ASC,
                u.nombre ASC,
                c.nombre ASC,
                n.bimestre ASC
        `;

        params.push(query.bimestre ?? null);

        return this.dataSource.query(sql, params);
    }

    // Convertir datos a CSV string
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
            'Nota Exámenes',
            'Nota Tareas',
            'Nota Participación',
            'Nota Final',
            'Escala',
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
            row.nota_examenes ?? '',
            row.nota_tareas ?? '',
            row.nota_participacion ?? '',
            row.nota_final ?? '',
            row.escala ?? '',
        ].map(escapeCell).join(','));

        return [headers.join(','), ...csvRows].join('\n');
    }
}