// src/modules/reports/pdf/pdf.generator.ts
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

// ── Tipos de datos que recibe el generador ───────────────────────────────────

export interface InformePdfData {
    informe: {
        tipo: string;
        titulo: string;
        motivo: string;
        antecedentes: string | null;
        observaciones: string;
        recomendaciones: string | null;
        derivadoA: string | null;
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
    parents: {
        nombre: string;
        apellido_paterno: string;
        apellido_materno: string | null;
        relacion: string;
        codigo_acceso: string | null;
    }[];
    psicologa: {
        nombre: string;
        apellido_paterno: string;
        apellido_materno: string | null;
        colegiatura: string | null;
    };
    /** Buffer de la imagen de firma (PNG/JPG desde R2). Null si no configurada. */
    firmaBuffer: Buffer | null;
}

// ── Colores ──────────────────────────────────────────────────────────────────

const PRIMARY = '#1a3a6b';
const INK = '#1a1a1a';
const MUTED = '#4a4a4a';
const LIGHT = '#7a7a7a';
const LINE = '#d0d0d0';

const TIPO_LABELS: Record<string, string> = {
    evaluacion: 'Evaluación psicológica',
    seguimiento: 'Reporte de seguimiento',
    derivacion_familia: 'Derivación a la familia',
    derivacion_externa: 'Derivación externa',
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PdfGenerator {

    async generateInformePdf(data: InformePdfData): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];

            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 60, bottom: 60, left: 65, right: 65 },
                info: {
                    Title: `Informe Psicológico — ${data.informe.titulo}`,
                    Author: `${data.psicologa.nombre} ${data.psicologa.apellido_paterno}`,
                    Creator: 'EduAula',
                },
            });

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            this.build(doc, data);
            doc.end();
        });
    }

    // ════════════════════════════════════════════════════════════════
    // ESTRUCTURA DEL DOCUMENTO
    // ════════════════════════════════════════════════════════════════

    private build(doc: PDFKit.PDFDocument, data: InformePdfData): void {
        const W = doc.page.width - 130; // ancho útil (margins: 65 + 65)

        this.header(doc, W);
        this.sectionDatos(doc, data, W);

        if (data.informe.derivadoA) {
            this.sectionTexto(doc, 'Derivado a', data.informe.derivadoA, W);
        }

        if (data.informe.tipo === 'derivacion_familia' && data.parents.length > 0) {
            this.sectionDestinatarios(doc, data.parents, W);
        }

        this.sectionTexto(doc, 'Motivo de consulta', data.informe.motivo, W);

        if (data.informe.antecedentes) {
            this.sectionTexto(doc, 'Antecedentes', data.informe.antecedentes, W);
        }

        this.sectionTexto(doc, 'Observaciones y hallazgos', data.informe.observaciones, W);

        if (data.informe.recomendaciones) {
            this.sectionTexto(doc, 'Recomendaciones', data.informe.recomendaciones, W);
        }

        this.footer(doc, data, W);
    }

    // ── Encabezado minimalista ───────────────────────────────────────

    private header(doc: PDFKit.PDFDocument, W: number): void {
        const x = 65;

        // Línea decorativa superior
        doc.rect(x, 50, W, 3).fill(PRIMARY);

        // Título principal
        doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
            .text('INFORME PSICOLÓGICO', x, 70, {
                width: W, align: 'center', characterSpacing: 2,
            });

        doc.moveDown(1.5);
    }

    // ── Sección: Datos de identificación ────────────────────────────

    private sectionDatos(doc: PDFKit.PDFDocument, data: InformePdfData, W: number): void {
        this.secTitle(doc, 'Datos de identificación', W);

        const s = data.student;
        const fullName = s
            ? `${s.apellido_paterno} ${s.apellido_materno ?? ''}, ${s.nombre}`.trim()
            : '—';

        const fecha = this.fmtDate(data.informe.finalizadoAt ?? data.informe.createdAt);

        const rows: [string, string][] = [
            ['Apellidos y nombres', fullName],
            ...(s?.codigo_estudiante ? [['Código', s.codigo_estudiante] as [string, string]] : []),
            ['Tipo de informe', TIPO_LABELS[data.informe.tipo] ?? data.informe.tipo],
            ['Fecha', fecha],
        ];

        if (data.informe.confidencial) {
            rows.push(['Confidencialidad', 'Documento confidencial']);
        }

        const labelW = 145;
        const valueX = 65 + labelW + 12;
        const valueW = W - labelW - 12;

        for (const [label, value] of rows) {
            const rowY = doc.y;
            doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT)
                .text(label, 65, rowY, { width: labelW });
            doc.font('Helvetica').fontSize(10).fillColor(INK)
                .text(value, valueX, rowY, { width: valueW });
            doc.moveDown(0.3);
        }

        doc.moveDown(0.6);
    }

    // ── Destinatarios (derivación a familia) ────────────────────────

    private sectionDestinatarios(
        doc: PDFKit.PDFDocument,
        parents: InformePdfData['parents'],
        W: number,
    ): void {
        this.secTitle(doc, 'Destinatarios', W);
        for (const p of parents) {
            const name = `${p.apellido_paterno} ${p.apellido_materno ?? ''}, ${p.nombre}`.trim();
            const relacion = p.relacion.charAt(0).toUpperCase() + p.relacion.slice(1);
            doc.font('Helvetica').fontSize(10).fillColor(INK)
                .text(`${relacion}: ${name}`, 65, doc.y, { width: W });
            doc.moveDown(0.2);
        }
        doc.moveDown(0.5);
    }

    // ── Sección de texto genérica ───────────────────────────────────

    private sectionTexto(
        doc: PDFKit.PDFDocument,
        title: string,
        content: string,
        W: number,
    ): void {
        if (doc.y > doc.page.height - 140) doc.addPage();
        this.secTitle(doc, title, W);
        doc.font('Helvetica').fontSize(10).fillColor(INK)
            .text(content, 65, doc.y, {
                width: W,
                align: 'justify',
                lineGap: 3,
            });
        doc.moveDown(1);
    }

    // ── Footer: firma + nombre + colegiatura ────────────────────────

    private footer(doc: PDFKit.PDFDocument, data: InformePdfData, W: number): void {
        const neededH = data.firmaBuffer ? 130 : 80;
        if (doc.y > doc.page.height - doc.page.margins.bottom - neededH) {
            doc.addPage();
        }

        doc.moveDown(3);

        // Firma centrada
        const sigW = 200;
        const sigX = 65 + (W - sigW) / 2;
        let sigY = doc.y;

        if (data.firmaBuffer) {
            try {
                doc.image(data.firmaBuffer, sigX + (sigW - 160) / 2, sigY,
                    { width: 160, height: 70, fit: [160, 70] });
            } catch { /* imagen corrupta — saltar */ }
            sigY += 76;
        } else {
            sigY += 40;
        }

        // Línea de firma
        doc.moveTo(sigX, sigY).lineTo(sigX + sigW, sigY)
            .strokeColor(INK).lineWidth(0.6).stroke();

        // Nombre de la psicóloga
        const fullName = `${data.psicologa.nombre} ${data.psicologa.apellido_paterno} ${data.psicologa.apellido_materno ?? ''}`.trim();
        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
            .text(fullName, sigX, sigY + 8, { width: sigW, align: 'center' });

        // Colegiatura
        if (data.psicologa.colegiatura) {
            doc.font('Helvetica').fontSize(8).fillColor(MUTED)
                .text(`CPsP ${data.psicologa.colegiatura}`, sigX, sigY + 21,
                    { width: sigW, align: 'center' });
        }
    }

    // ── Helpers internos ────────────────────────────────────────────

    private secTitle(doc: PDFKit.PDFDocument, title: string, W: number): void {
        const y = doc.y;
        // Línea separadora tenue
        doc.moveTo(65, y).lineTo(65 + W, y)
            .strokeColor(LINE).lineWidth(0.5).stroke();
        // Título de sección
        doc.font('Helvetica-Bold').fontSize(9).fillColor(PRIMARY)
            .text(title.toUpperCase(), 65, y + 7, {
                width: W,
                characterSpacing: 0.8,
            });
        doc.moveDown(0.7);
    }

    private fmtDate(date: Date | string | null | undefined): string {
        if (!date) return '—';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '—';
        const months = [
            'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
        ];
        return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
    }
}