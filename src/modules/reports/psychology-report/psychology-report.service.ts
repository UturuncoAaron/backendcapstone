// src/modules/reports/psychology-report/psychology-report.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { PsychologyService } from '../../psychology/psychology.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { PdfGenerator, InformePdfData } from '../pdf/pdf.generator.js';

@Injectable()
export class PsychologyReportService {
    private readonly logger = new Logger(PsychologyReportService.name);

    constructor(
        private readonly psychologyService: PsychologyService,
        private readonly pdfGenerator: PdfGenerator,
        private readonly storage: StorageService,
        @InjectDataSource() private readonly ds: DataSource,
    ) { }

    /**
     * Genera el PDF del informe psicológico.
     * Solo la psicóloga propietaria puede generarlo (el check de ownership
     * lo delega a `PsychologyService.findInformeById`).
     *
     * Retorna el Buffer del PDF y el filename para el header
     * `Content-Disposition`.
     */
    async generateInformePdf(
        psychologistId: string,
        informeId: string,
    ): Promise<{ buffer: Buffer; filename: string }> {

        // Obtener informe (lanza ForbiddenException si no le pertenece)
        const informe = await this.psychologyService.findInformeById(
            psychologistId,
            informeId,
        );

        // Consultas paralelas: alumno, psicóloga, padres (solo si aplica)
        const [studentRows, psicologaRows, parentsRows] = await Promise.all([
            this.ds.query<any[]>(
                `SELECT a.nombre, a.apellido_paterno, a.apellido_materno,
                        a.codigo_estudiante
                   FROM alumnos a
                  WHERE a.id = $1`,
                [informe.studentId],
            ),
            this.ds.query<any[]>(
                `SELECT ps.nombre, ps.apellido_paterno, ps.apellido_materno,
                        ps.colegiatura, ps.firma_storage_key
                   FROM psicologas ps
                  WHERE ps.id = $1`,
                [psychologistId],
            ),
            informe.tipo === 'derivacion_familia'
                ? this.ds.query<any[]>(
                    `SELECT p.nombre, p.apellido_paterno, p.apellido_materno,
                              p.relacion, c.codigo_acceso
                         FROM padre_alumno pa
                         JOIN padres  p ON p.id = pa.padre_id
                         JOIN cuentas c ON c.id = p.id AND c.activo = TRUE
                        WHERE pa.alumno_id = $1
                        ORDER BY p.apellido_paterno, p.nombre`,
                    [informe.studentId],
                )
                : Promise.resolve([]),
        ]);

        const psicologa = psicologaRows[0];
        const student = studentRows[0] ?? null;

        // Intentar cargar la firma como Buffer desde R2
        const firmaBuffer = psicologa?.firma_storage_key
            ? await this.fetchFirmaBuffer(psicologa.firma_storage_key)
            : null;

        const data: InformePdfData = {
            informe: {
                tipo: informe.tipo,
                titulo: informe.titulo,
                motivo: informe.motivo,
                antecedentes: informe.antecedentes,
                observaciones: informe.observaciones,
                recomendaciones: informe.recomendaciones,
                derivadoA: informe.derivadoA,
                confidencial: informe.confidencial,
                estado: informe.estado,
                finalizadoAt: informe.finalizadoAt,
                createdAt: informe.createdAt,
            },
            student,
            parents: parentsRows,
            psicologa: {
                nombre: psicologa?.nombre ?? 'Psicóloga',
                apellido_paterno: psicologa?.apellido_paterno ?? '',
                apellido_materno: psicologa?.apellido_materno ?? null,
                colegiatura: psicologa?.colegiatura ?? null,
            },
            firmaBuffer,
        };

        const buffer = await this.pdfGenerator.generateInformePdf(data);
        const studentName = student
            ? `${student.apellido_paterno}_${student.nombre}`
            : 'alumno';
        const date = new Date().toISOString().split('T')[0];
        const filename = `informe_${studentName}_${date}.pdf`
            .replace(/\s+/g, '_')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        return { buffer, filename };
    }

    // ── Helpers ──────────────────────────────────────────────────────


    private async fetchFirmaBuffer(storageKey: string): Promise<Buffer | null> {
        try {
            const url = this.storage.getPublicUrl(storageKey);
            const res = await fetch(url);
            if (!res.ok) return null;
            const ab = await res.arrayBuffer();
            return Buffer.from(ab);
        } catch (err) {
            this.logger.warn(
                `No se pudo cargar la firma desde R2: ${(err as Error).message}`,
            );
            return null;
        }
    }
}