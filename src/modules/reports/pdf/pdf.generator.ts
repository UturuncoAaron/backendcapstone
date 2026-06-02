import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface InformePdfData {
    informe: {
        edadEvaluacion: number | null;
        motivoConsultaCorto: string | null;
        referente: string | null;
        fechaEvaluacionInicio: string | null;
        fechaEvaluacionFin: string | null;
        fechaInforme: string | null;
        tecnicasUtilizadas: string | null;
        instrumentosUtilizados: string | null;
        motivoConsulta: string | null;
        antecedentesFamilia: string | null;
        antecedentesAcademico: string | null;
        antecedentesEscolar: string | null;
        antecedentesAutopercepcion: string | null;
        observacionesConducta: string | null;
        resultadosCognitiva: string | null;
        resultadosEmocional: string | null;
        resultadosConductual: string | null;
        resultadosSocial: string | null;
        analisisResultados: string | null;
        conclusiones: string | null;
        recomendacionesInstitucion: string | null;
        recomendacionesFamilia: string | null;
        confidencial: boolean;
        estado: string;
        finalizadoAt: Date | null;
        createdAt: Date;
    };
    student: {
        nombre: string;
        apellido_paterno: string;
        apellido_materno: string | null;
        codigo_estudiante: string | null;
    } | null;
    psicologa: {
        nombre: string;
        apellido_paterno: string;
        apellido_materno: string | null;
        colegiatura: string | null;
    };
    firmaBuffer: Buffer | null;
}

const INK = '#1a1a1a';
const MUTED = '#4a4a4a';
const LINE = '#c0c0c0';
const L = 65;   // margen izquierdo
const R = 65;   // margen derecho

@Injectable()
export class PdfGenerator {

    async generateInformePdf(data: InformePdfData): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 55, bottom: 55, left: L, right: R },
                info: { Title: 'Informe Psicológico', Creator: 'EduAula' },
            });
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            this.build(doc, data);
            doc.end();
        });
    }

    private get W(): number { return 595.28 - L - R; }

    private build(doc: PDFKit.PDFDocument, data: InformePdfData): void {
        this.header(doc);
        this.seccionFiliacion(doc, data);
        this.seccionTexto(doc, 'II. MOTIVO DE CONSULTA', data.informe.motivoConsulta);
        this.seccionAntecedentes(doc, data.informe);
        this.seccionTexto(doc, 'IV. OBSERVACIONES GENERALES Y DE CONDUCTA', data.informe.observacionesConducta);
        this.seccionResultados(doc, data.informe);
        this.seccionTexto(doc, 'VI. ANÁLISIS DE LOS RESULTADOS', data.informe.analisisResultados);
        this.seccionTexto(doc, 'VII. CONCLUSIONES', data.informe.conclusiones);
        this.seccionRecomendaciones(doc, data.informe);
        this.footer(doc, data);
    }

    // ── Encabezado ──────────────────────────────────────────────

    private header(doc: PDFKit.PDFDocument): void {
        doc.font('Helvetica-Bold').fontSize(13).fillColor(INK)
            .text('INFORME PSICOLÓGICO', L, doc.y, { width: this.W, align: 'center', underline: true });
        doc.moveDown(1.2);
    }

    // ── I. Datos de filiación ────────────────────────────────────

    private seccionFiliacion(doc: PDFKit.PDFDocument, data: InformePdfData): void {
        this.secTitle(doc, 'I. DATOS DE FILIACIÓN');

        const s = data.student;
        const nombreCompleto = s
            ? `${s.nombre} ${s.apellido_paterno}${s.apellido_materno ? ' ' + s.apellido_materno : ''}`
            : '—';

        // Rango de fechas de evaluación
        let fechaEval = '—';
        if (data.informe.fechaEvaluacionInicio && data.informe.fechaEvaluacionFin) {
            fechaEval = `${this.fmtDate(data.informe.fechaEvaluacionInicio)} – ${this.fmtDate(data.informe.fechaEvaluacionFin)}`;
        } else if (data.informe.fechaEvaluacionInicio) {
            fechaEval = this.fmtDate(data.informe.fechaEvaluacionInicio);
        }

        const filasFiliacion: [string, string][] = [
            ['Nombres y apellidos', nombreCompleto],
            ['Edad', data.informe.edadEvaluacion ? `${data.informe.edadEvaluacion} años` : '—'],
            ['Motivo de consulta', data.informe.motivoConsultaCorto ?? '—'],
            ['Referente', data.informe.referente ?? '—'],
            ['Evaluador', `${data.psicologa.nombre} ${data.psicologa.apellido_paterno}${data.psicologa.apellido_materno ? ' ' + data.psicologa.apellido_materno : ''}`],
            ['Fecha de Evaluación', fechaEval],
            ['Fecha de Informe', this.fmtDate(data.informe.fechaInforme ?? data.informe.finalizadoAt ?? data.informe.createdAt)],
        ];

        this.tabla2col(doc, filasFiliacion);
        this.lineaSeparadora(doc);

        const filasMetodo: [string, string][] = [
            ['Técnicas Utilizadas', data.informe.tecnicasUtilizadas ?? '—'],
            ['Instrumentos utilizados', data.informe.instrumentosUtilizados ?? '—'],
        ];
        this.tabla2col(doc, filasMetodo);
        doc.moveDown(1);
    }

    // ── III. Antecedentes ────────────────────────────────────────

    private seccionAntecedentes(doc: PDFKit.PDFDocument, informe: InformePdfData['informe']): void {
        const tieneAlgo = informe.antecedentesFamilia ||
            informe.antecedentesAcademico ||
            informe.antecedentesEscolar ||
            informe.antecedentesAutopercepcion;
        if (!tieneAlgo) return;

        this.secTitle(doc, 'III. ANTECEDENTES');

        if (informe.antecedentesFamilia) {
            this.subTitle(doc, 'Dinámica familiar');
            this.parrafo(doc, informe.antecedentesFamilia);
        }
        if (informe.antecedentesAcademico) {
            this.subTitle(doc, 'Intereses académicos');
            this.parrafo(doc, informe.antecedentesAcademico);
        }
        if (informe.antecedentesEscolar) {
            this.subTitle(doc, 'Trayectoria escolar');
            this.parrafo(doc, informe.antecedentesEscolar);
        }
        if (informe.antecedentesAutopercepcion) {
            this.subTitle(doc, 'Autopercepción');
            this.parrafo(doc, informe.antecedentesAutopercepcion);
        }
        doc.moveDown(0.5);
    }

    // ── V. Resultados ────────────────────────────────────────────

    private seccionResultados(doc: PDFKit.PDFDocument, informe: InformePdfData['informe']): void {
        const tieneAlgo = informe.resultadosCognitiva ||
            informe.resultadosEmocional ||
            informe.resultadosConductual ||
            informe.resultadosSocial;
        if (!tieneAlgo) return;

        this.secTitle(doc, 'V. RESULTADOS');

        if (informe.resultadosCognitiva) {
            this.subTitle(doc, 'Área Cognitiva');
            this.parrafo(doc, informe.resultadosCognitiva);
        }
        if (informe.resultadosEmocional) {
            this.subTitle(doc, 'Área Emocional');
            this.parrafo(doc, informe.resultadosEmocional);
        }
        if (informe.resultadosConductual) {
            this.subTitle(doc, 'Área Conductual');
            this.parrafo(doc, informe.resultadosConductual);
        }
        if (informe.resultadosSocial) {
            this.subTitle(doc, 'Área Social');
            this.parrafo(doc, informe.resultadosSocial);
        }
        doc.moveDown(0.5);
    }

    // ── VIII. Recomendaciones ────────────────────────────────────

    private seccionRecomendaciones(doc: PDFKit.PDFDocument, informe: InformePdfData['informe']): void {
        if (!informe.recomendacionesInstitucion && !informe.recomendacionesFamilia) return;
        this.secTitle(doc, 'VIII. RECOMENDACIONES');
        if (informe.recomendacionesInstitucion) {
            this.subTitle(doc, 'Para la Institución Educativa');
            this.parrafo(doc, informe.recomendacionesInstitucion);
        }
        if (informe.recomendacionesFamilia) {
            this.subTitle(doc, 'Para la Familia');
            this.parrafo(doc, informe.recomendacionesFamilia);
        }
        doc.moveDown(0.5);
    }

    // ── Footer / firma ───────────────────────────────────────────

    private footer(doc: PDFKit.PDFDocument, data: InformePdfData): void {
        const neededH = data.firmaBuffer ? 130 : 80;
        if (doc.y > doc.page.height - doc.page.margins.bottom - neededH) doc.addPage();

        doc.moveDown(3);

        const sigW = 200;
        const sigX = L + (this.W - sigW) / 2;
        let sigY = doc.y;

        if (data.firmaBuffer) {
            try {
                doc.image(data.firmaBuffer, sigX + (sigW - 160) / 2, sigY,
                    { width: 160, height: 70, fit: [160, 70] });
            } catch { /* imagen corrupta */ }
            sigY += 76;
        } else {
            sigY += 40;
        }

        doc.moveTo(sigX, sigY).lineTo(sigX + sigW, sigY)
            .strokeColor(INK).lineWidth(0.6).stroke();

        const fullName = [
            data.psicologa.nombre,
            data.psicologa.apellido_paterno,
            data.psicologa.apellido_materno ?? '',
        ].filter(Boolean).join(' ');

        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
            .text(fullName, sigX, sigY + 8, { width: sigW, align: 'center' });

        doc.font('Helvetica').fontSize(8).fillColor(MUTED)
            .text('PSICÓLOGA', sigX, sigY + 20, { width: sigW, align: 'center' });

        if (data.psicologa.colegiatura) {
            doc.font('Helvetica').fontSize(8).fillColor(MUTED)
                .text(`CPsP ${data.psicologa.colegiatura}`, sigX, sigY + 31,
                    { width: sigW, align: 'center' });
        }
    }

    // ── Helpers de layout ────────────────────────────────────────

    private secTitle(doc: PDFKit.PDFDocument, title: string): void {
        this.pageBreakIfNeeded(doc, 60);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
            .text(title, L, doc.y, { width: this.W });
        doc.moveDown(0.5);
    }

    private subTitle(doc: PDFKit.PDFDocument, title: string): void {
        this.pageBreakIfNeeded(doc, 40);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
            .text(title, L, doc.y, { width: this.W });
        doc.moveDown(0.3);
    }

    private parrafo(doc: PDFKit.PDFDocument, text: string): void {
        doc.font('Helvetica').fontSize(10).fillColor(INK)
            .text(text, L, doc.y, { width: this.W, align: 'justify', lineGap: 2 });
        doc.moveDown(0.8);
    }

    private seccionTexto(doc: PDFKit.PDFDocument, title: string, content: string | null): void {
        if (!content) return;
        this.pageBreakIfNeeded(doc, 60);
        this.secTitle(doc, title);
        this.parrafo(doc, content);
    }

    /** Tabla de dos columnas estilo "label : valor" del PDF original */
    private tabla2col(doc: PDFKit.PDFDocument, filas: [string, string][]): void {
        const labelW = 150;
        const valueX = L + labelW + 10;
        const valueW = this.W - labelW - 10;

        for (const [label, value] of filas) {
            this.pageBreakIfNeeded(doc, 20);
            const rowY = doc.y;
            doc.font('Helvetica').fontSize(10).fillColor(INK)
                .text(label, L, rowY, { width: labelW, continued: false });
            doc.font('Helvetica').fontSize(10).fillColor(INK)
                .text(`: ${value}`, valueX, rowY, { width: valueW });
            doc.moveDown(0.25);
        }
    }

    private lineaSeparadora(doc: PDFKit.PDFDocument): void {
        doc.moveDown(0.5);
        doc.moveTo(L, doc.y).lineTo(L + this.W, doc.y)
            .strokeColor(LINE).lineWidth(0.5).stroke();
        doc.moveDown(0.5);
    }

    private pageBreakIfNeeded(doc: PDFKit.PDFDocument, needed: number): void {
        if (doc.y > doc.page.height - doc.page.margins.bottom - needed) doc.addPage();
    }

    private fmtDate(date: Date | string | null | undefined): string {
        if (!date) return '—';
        const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : new Date(date);
        if (isNaN(d.getTime())) return '—';
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
    }
}