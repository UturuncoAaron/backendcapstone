import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

import { PsychologyArchivosService } from '../psychology/archivos/archivos.service.js';
import { PsychologyReportService } from '../reports/psychology-report/psychology-report.service.js';

@Injectable()
export class StudentPortalService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly archivosSvc: PsychologyArchivosService,
        private readonly reportSvc: PsychologyReportService,
    ) { }

    async getInformes(alumnoId: string) {
        return this.dataSource.query<unknown[]>(`
            SELECT
                i.id,
                i.motivo_consulta_corto AS titulo,
                i.finalizado_at AS "finalizadoAt",
                TRIM(CONCAT(
                    ps.nombre, ' ', ps.apellido_paterno,
                    COALESCE(' ' || ps.apellido_materno, '')
                )) AS "psicologaNombre"
            FROM informes_psicologicos i
            JOIN psicologas ps ON ps.id = i.psicologa_id
            WHERE i.alumno_id    = $1
              AND i.estado       = 'finalizado'
              AND i.confidencial = FALSE
            ORDER BY i.finalizado_at DESC
        `, [alumnoId]);
    }

    async getInformePdf(alumnoId: string, informeId: string, res: Response): Promise<void> {
        const [informe] = await this.dataSource.query<{
            psicologa_id: string;
            alumno_id: string;
            estado: string;
            confidencial: boolean;
        }[]>(
            `SELECT psicologa_id, alumno_id, estado, confidencial
               FROM informes_psicologicos
              WHERE id = $1`,
            [informeId],
        );

        if (!informe || informe.alumno_id !== alumnoId) throw new NotFoundException('Informe no disponible');
        if (informe.estado !== 'finalizado') throw new NotFoundException('Informe no disponible');
        if (informe.confidencial) throw new ForbiddenException('Este informe es confidencial');

        const { buffer, filename } = await this.reportSvc.generateInformePdf(
            informe.psicologa_id,
            informeId,
        );

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.end(buffer);
    }

    async getArchivos(alumnoId: string, categoria?: 'ficha' | 'test') {
        return this.archivosSvc.listForAlumno(alumnoId, categoria);
    }

    async getArchivoUrl(alumnoId: string, archivoId: string): Promise<{ url: string }> {
        return this.archivosSvc.resolveDownload(archivoId, { role: 'alumno', userId: alumnoId });
    }

    async getArchivoPreviewUrl(alumnoId: string, archivoId: string): Promise<{ url: string }> {
        return this.archivosSvc.resolvePreview(archivoId, { role: 'alumno', userId: alumnoId });
    }
}