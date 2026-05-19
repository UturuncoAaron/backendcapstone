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

const BLUE = '#1a3a6b';
const INK = '#111111';
const MUTED = '#555555';
const BORDER = '#cccccc';
const BG_NOTE = '#e8edf5';

const TIPO_LABELS: Record<string, string> = {
    evaluacion: 'Evaluación Psicológica',
    seguimiento: 'Reporte de Seguimiento',
    derivacion_familia: 'Derivación a la Familia',
    derivacion_externa: 'Derivación Externa',
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generador de PDFs institucionales usando PDFKit.
 * Stateless: recibe un InformePdfData y devuelve un Buffer.
 * Se puede reutilizar para otros documentos (libretas, constancias, etc.)
 * agregando métodos públicos similares a `generateInformePdf`.
 */
@Injectable()
export class PdfGenerator {

    async generateInformePdf(data: InformePdfData): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];

            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 60, right: 60 },
                info: {
                    Title: `Informe Psicológico — ${data.informe.titulo}`,
                    Author: 'EduAula · Servicio de Psicología Educativa',
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
        // Borde azul superior
        doc.rect(60, 40, doc.page.width - 120, 4).fill(BLUE);

        this.header(doc);
        this.sectionDatos(doc, data);

        if (data.informe.tipo === 'derivacion_familia' && data.parents.length > 0) {
            this.sectionDestinatarios(doc, data.parents);
        }

        if (data.informe.derivadoA) {
            this.sectionTexto(doc, 'II.', 'DERIVADO A', data.informe.derivadoA);
        }

        this.sectionTexto(doc, 'II.', 'MOTIVO DE CONSULTA', data.informe.motivo);

        if (data.informe.antecedentes) {
            this.sectionTexto(doc, 'III.', 'ANTECEDENTES', data.informe.antecedentes);
        }

        this.sectionTexto(doc, 'IV.', 'OBSERVACIONES Y HALLAZGOS', data.informe.observaciones);

        if (data.informe.recomendaciones) {
            this.sectionTexto(doc, 'V.', 'RECOMENDACIONES', data.informe.recomendaciones);
        }

        this.footer(doc, data);
    }

    // ── Encabezado institucional ────────────────────────────────────

    private header(doc: PDFKit.PDFDocument): void {
        const y = doc.y + 12;

        // Círculo monograma
        doc.circle(78, y + 18, 18).fill(BLUE);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
            .text('IE', 72, y + 12);

        // Nombre IE y ubicación
        doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE)
            .text('I.E. JUAN PABLO VIZCARDO Y GUZMÁN', 106, y + 7);
        doc.font('Helvetica').fontSize(8).fillColor(MUTED)
            .text('Ugel 04 · Comas, Lima — Perú', 106, y + 20);

        // Doble línea con label
        const lineY = y + 44;
        doc.moveTo(60, lineY).lineTo(doc.page.width - 60, lineY)
            .strokeColor(BLUE).lineWidth(1.5).stroke();
        doc.font('Helvetica-Bold').fontSize(7).fillColor(BLUE)
            .text('SERVICIO DE PSICOLOGÍA EDUCATIVA', 60, lineY + 5,
                { width: doc.page.width - 120, align: 'center', characterSpacing: 2 });
        doc.moveTo(60, lineY + 17).lineTo(doc.page.width - 60, lineY + 17)
            .strokeColor(BLUE).lineWidth(0.5).stroke();

        // Título
        doc.font('Helvetica-Bold').fontSize(16).fillColor(INK)
            .text('INFORME PSICOLÓGICO', 60, lineY + 26,
                { width: doc.page.width - 120, align: 'center', characterSpacing: 3 });

        doc.moveDown(1.4);
    }

    // ── Sección I: Datos de identificación ─────────────────────────

    private sectionDatos(doc: PDFKit.PDFDocument, data: InformePdfData): void {
        this.secTitle(doc, 'I.', 'DATOS DE IDENTIFICACIÓN');

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
            ['Estado', data.informe.estado === 'finalizado' ? 'Finalizado' : 'Borrador'],
            ...(data.informe.confidencial
                ? [['Confidencialidad', 'Documento confidencial — uso restringido al destinatario'] as [string, string]]
                : []),
        ];

        const labelW = 150;
        const valueX = 60 + labelW + 10;
        const valueW = doc.page.width - 120 - labelW - 10;

        for (const [label, value] of rows) {
            const rowY = doc.y;
            doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
                .text(label.toUpperCase(), 60, rowY, { width: labelW, lineBreak: false });
            doc.font('Helvetica').fontSize(10).fillColor(INK)
                .text(value, valueX, rowY, { width: valueW });
            doc.moveDown(0.15);
        }

        doc.moveDown(0.6);
    }

    // ── Destinatarios (derivación a familia) ────────────────────────

    private sectionDestinatarios(
        doc: PDFKit.PDFDocument,
        parents: InformePdfData['parents'],
    ): void {
        this.secTitle(doc, 'II.', 'DESTINATARIOS');
        for (const p of parents) {
            const name = `${p.apellido_paterno} ${p.apellido_materno ?? ''}, ${p.nombre}`.trim();
            const relacion = p.relacion.charAt(0).toUpperCase() + p.relacion.slice(1);
            const dni = p.codigo_acceso ? ` · ${p.codigo_acceso}` : '';
            doc.font('Helvetica').fontSize(10).fillColor(INK)
                .text(`${relacion}: ${name}${dni}`, 60, doc.y,
                    { width: doc.page.width - 120 });
            doc.moveDown(0.2);
        }
        doc.moveDown(0.5);
    }

    // ── Sección de texto genérica ───────────────────────────────────

    private sectionTexto(
        doc: PDFKit.PDFDocument,
        num: string,
        title: string,
        content: string,
    ): void {
        if (doc.y > doc.page.height - 160) doc.addPage();
        this.secTitle(doc, num, title);
        doc.font('Helvetica').fontSize(10).fillColor(INK)
            .text(content, 60, doc.y, {
                width: doc.page.width - 120,
                align: 'justify',
                lineGap: 2,
            });
        doc.moveDown(0.8);
    }

    // ── Footer + Firma ──────────────────────────────────────────────

    private footer(doc: PDFKit.PDFDocument, data: InformePdfData): void {
        const firmaH = data.firmaBuffer ? 80 : 60;
        if (doc.y > doc.page.height - doc.page.margins.bottom - firmaH - 60) {
            doc.addPage();
        }

        doc.moveDown(2);

        // Nota legal con fondo azul claro
        const noteY = doc.y;
        doc.rect(60, noteY, doc.page.width - 120, 28).fill(BG_NOTE);
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MUTED)
            .text(
                'El presente documento tiene carácter informativo y forma parte del expediente psicológico del estudiante.',
                66, noteY + 8,
                { width: doc.page.width - 132 },
            );

        doc.moveDown(2.5);

        // Firma alineada a la derecha
        const sigW = 200;
        const sigX = doc.page.width - 60 - sigW;
        let sigY = doc.y;

        if (data.firmaBuffer) {
            try {
                doc.image(data.firmaBuffer, sigX + (sigW - 160) / 2, sigY,
                    { width: 160, height: 70, fit: [160, 70] });
            } catch { /* imagen corrupta: saltar */ }
            sigY += 74;
        } else {
            sigY += 55; // espacio en blanco para firma manuscrita
        }

        // Línea de firma
        doc.moveTo(sigX, sigY).lineTo(sigX + sigW, sigY)
            .strokeColor(INK).lineWidth(0.8).stroke();

        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
            .text('Psicología Educativa', sigX, sigY + 6,
                { width: sigW, align: 'center' });

        doc.font('Helvetica').fontSize(8).fillColor(MUTED)
            .text('I.E. Juan Pablo Vizcardo y Guzmán — Comas', sigX, sigY + 18,
                { width: sigW, align: 'center' });

        if (data.psicologa.colegiatura) {
            doc.font('Helvetica').fontSize(8).fillColor(MUTED)
                .text(`CPsP ${data.psicologa.colegiatura}`, sigX, sigY + 30,
                    { width: sigW, align: 'center' });
        }
    }

    // ── Helpers internos ───────────────────────────────────────────

    private secTitle(doc: PDFKit.PDFDocument, num: string, title: string): void {
        const y = doc.y;
        doc.moveTo(60, y).lineTo(doc.page.width - 60, y)
            .strokeColor(BORDER).lineWidth(0.5).stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor(BLUE)
            .text(`${num}  ${title}`, 60, y + 5,
                { width: doc.page.width - 120, characterSpacing: 1 });
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