import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueryReportDto } from './dto/query-report.dto.js';

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
    actividad: string | null;  // antes nota_tareas
    tipo: string | null;       // antes nota_participacion
    nota: number | null;       // antes nota_final
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

        // Ahora filtramos por el bimestre del periodo, ya que notas no lo tiene
        if (query.bimestre) {
            conditions.push(`p.bimestre = $${paramIndex++}`);
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

        // reports.service.ts — reemplazar el SELECT de getGradesReport
        const sql = `
            SELECT
                a.id                    AS alumno_id,
                cu.numero_documento,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                g.nombre                AS grado,
                s.nombre                AS seccion,
                c.nombre                AS curso,
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
                END                     AS escala
            FROM matriculas m
            JOIN alumnos a    ON a.id = m.alumno_id
            JOIN cuentas cu   ON cu.id = a.id
            JOIN secciones s  ON s.id = m.seccion_id
            JOIN grados g     ON g.id = s.grado_id
            JOIN periodos p   ON p.id = m.periodo_id
            LEFT JOIN cursos c ON c.seccion_id = m.seccion_id
                            AND c.periodo_id = m.periodo_id
                            AND c.activo = true
            LEFT JOIN notas n  ON n.alumno_id = m.alumno_id
                            AND n.curso_id = c.id
                            AND n.periodo_id = m.periodo_id
            ${whereClause}
            ORDER BY g.orden, s.nombre, a.apellido_paterno, a.nombre, c.nombre
                `;

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
            'Actividad',
            'Tipo',
            'Nota',
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
            row.actividad ?? '',
            row.tipo ?? '',
            row.nota ?? '',
            row.escala ?? '',
        ].map(escapeCell).join(','));

        return [headers.join(','), ...csvRows].join('\n');
    }
}