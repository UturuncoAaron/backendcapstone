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

    async generateInformePdf(
        psychologistId: string,
        informeId: string,
    ): Promise<{ buffer: Buffer; filename: string }> {

        const informe = await this.psychologyService.findInformeById(
            psychologistId,
            informeId,
        );

        const [studentRows, psicologaRows] = await Promise.all([
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
        ]);

        const psicologa = psicologaRows[0];
        const student = studentRows[0] ?? null;

        const firmaBuffer = psicologa?.firma_storage_key
            ? await this.fetchFirmaBuffer(psicologa.firma_storage_key)
            : null;

        const data: InformePdfData = {
            informe: {
                edadEvaluacion: informe.edadEvaluacion,
                motivoConsultaCorto: informe.motivoConsultaCorto,
                referente: informe.referente,
                fechaEvaluacionInicio: informe.fechaEvaluacionInicio,
                fechaEvaluacionFin: informe.fechaEvaluacionFin,
                fechaInforme: informe.fechaInforme,
                tecnicasUtilizadas: informe.tecnicasUtilizadas,
                instrumentosUtilizados: informe.instrumentosUtilizados,
                motivoConsulta: informe.motivoConsulta,
                antecedentesFamilia: informe.antecedentesFamilia,
                antecedentesAcademico: informe.antecedentesAcademico,
                antecedentesEscolar: informe.antecedentesEscolar,
                antecedentesAutopercepcion: informe.antecedentesAutopercepcion,
                observacionesConducta: informe.observacionesConducta,
                resultadosCognitiva: informe.resultadosCognitiva,
                resultadosEmocional: informe.resultadosEmocional,
                resultadosConductual: informe.resultadosConductual,
                resultadosSocial: informe.resultadosSocial,
                analisisResultados: informe.analisisResultados,
                conclusiones: informe.conclusiones,
                recomendacionesInstitucion: informe.recomendacionesInstitucion,
                recomendacionesFamilia: informe.recomendacionesFamilia,
                confidencial: informe.confidencial,
                estado: informe.estado,
                finalizadoAt: informe.finalizadoAt,
                createdAt: informe.createdAt,
            },
            student,
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

    private async fetchFirmaBuffer(storageKey: string): Promise<Buffer | null> {
        try {
            const url = this.storage.getPublicUrl(storageKey);
            const res = await fetch(url);
            if (!res.ok) return null;
            const ab = await res.arrayBuffer();
            return Buffer.from(ab);
        } catch (err) {
            this.logger.warn(`No se pudo cargar la firma desde R2: ${(err as Error).message}`);
            return null;
        }
    }
}