import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface PdfTableConfig {
    title: string;
    subtitle?: string;
    headers: string[];
    keys: string[];
    columnWidths: number[];
    alignments?: ('left' | 'center' | 'right')[];
}

const PRIMARY_COLOR = '#1E3A5F'; // Navy institucional de EduAula
const TEXT_COLOR = '#1A1A1A';
const MUTED_COLOR = '#64748B';
const BORDER_COLOR = '#E2E8F0';
const STRIPE_COLOR = '#F8FAFC';

const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const PAGE_WIDTH = 595.28; // A4 estándar

@Injectable()
export class AttendancePdfBuilder {
    private get USABLE_WIDTH(): number {
        return PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    }

    async buildTablePdf(data: any[], config: PdfTableConfig): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: MARGIN_LEFT, right: MARGIN_RIGHT },
                info: { Title: config.title, Creator: 'EduAula' },
            });

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            this.renderDocument(doc, data, config);
            doc.end();
        });
    }

    private renderDocument(doc: PDFKit.PDFDocument, data: any[], config: PdfTableConfig) {
        // 1. Encabezado Institucional / Membrete
        doc.font('Helvetica-Bold').fontSize(14).fillColor(PRIMARY_COLOR)
            .text('EDUAULA — SISTEMA DE GESTIÓN INSTITUCIONAL', MARGIN_LEFT, doc.y);

        doc.font('Helvetica').fontSize(9).fillColor(MUTED_COLOR)
            .text(`Reporte Oficial de Control  •  Generado el: ${new Date().toLocaleDateString('es-PE')}`);

        doc.moveDown(1.5);

        // Linea divisoria superior
        doc.moveTo(MARGIN_LEFT, doc.y).lineTo(MARGIN_LEFT + this.USABLE_WIDTH, doc.y)
            .strokeColor(BORDER_COLOR).lineWidth(1).stroke();

        doc.moveDown(1.5);

        // 2. Títulos del Reporte
        doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_COLOR).text(config.title.toUpperCase());
        if (config.subtitle) {
            doc.font('Helvetica').fontSize(10).fillColor(MUTED_COLOR).text(config.subtitle);
        }
        doc.moveDown(1.5);

        // 3. Renderizar Tabla Nva
        this.renderTable(doc, data, config);
    }

    private renderTable(doc: PDFKit.PDFDocument, data: any[], config: PdfTableConfig) {
        let currentY = doc.y;
        const rowHeight = 22;
        const fontSize = 9;

        // --- Dibujar Cabecera ---
        doc.rect(MARGIN_LEFT, currentY, this.USABLE_WIDTH, rowHeight).fill(PRIMARY_COLOR);

        let currentX = MARGIN_LEFT;
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#FFFFFF');

        config.headers.forEach((header, index) => {
            const width = config.columnWidths[index];
            const align = config.alignments?.[index] || 'left';

            doc.text(header, currentX + 5, currentY + 6, {
                width: width - 10,
                align: align,
            });
            currentX += width;
        });

        currentY += rowHeight;

        // --- Dibujar Filas ---
        doc.fontSize(fontSize).fillColor(TEXT_COLOR);

        data.forEach((row, rowIndex) => {
            // Validar si la fila cabe en la página actual, si no, crear una nueva
            if (currentY > doc.page.height - doc.page.margins.bottom - rowHeight) {
                doc.addPage();
                currentY = doc.page.margins.top;

                // Repetir cabecera en la nueva página para mantener legibilidad
                doc.rect(MARGIN_LEFT, currentY, this.USABLE_WIDTH, rowHeight).fill(PRIMARY_COLOR);
                let headerX = MARGIN_LEFT;
                doc.font('Helvetica-Bold').fillColor('#FFFFFF');
                config.headers.forEach((header, index) => {
                    const width = config.columnWidths[index];
                    const align = config.alignments?.[index] || 'left';
                    doc.text(header, headerX + 5, currentY + 6, { width: width - 10, align: align });
                    headerX += width;
                });
                currentY += rowHeight;
                doc.font('Helvetica').fillColor(TEXT_COLOR);
            }

            // Fondo intercalado (zebra striping)
            if (rowIndex % 2 === 1) {
                doc.rect(MARGIN_LEFT, currentY, this.USABLE_WIDTH, rowHeight).fill(STRIPE_COLOR);
            }

            currentX = MARGIN_LEFT;

            config.keys.forEach((key, colIndex) => {
                const width = config.columnWidths[colIndex];
                const align = config.alignments?.[colIndex] || 'left';
                const val = row[key] !== null && row[key] !== undefined ? String(row[key]) : '—';

                doc.fillColor(TEXT_COLOR).text(val, currentX + 5, currentY + 6, {
                    width: width - 10,
                    align: align,
                    lineBreak: false
                });
                currentX += width;
            });

            // Línea inferior de la celda
            doc.moveTo(MARGIN_LEFT, currentY + rowHeight)
                .lineTo(MARGIN_LEFT + this.USABLE_WIDTH, currentY + rowHeight)
                .strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();

            currentY += rowHeight;
        });
    }
}