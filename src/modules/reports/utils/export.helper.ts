import { Response } from 'express';
import * as ExcelJS from 'exceljs';

const HEADER_ARGB = '1E3A5F';
const HEADER_TEXT = 'FFFFFF';

export interface ExportColumnMap {
    [key: string]: string;
}

/**
 * Genera un libro de Excel (Workbook) con la paleta de colores institucionales.
 */
export function buildXlsx(
    sheetName: string,
    rows: readonly object[],
    headers?: Record<string, string>,
): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduAula';
    wb.created = new Date();

    const safeName = sheetName.slice(0, 31);
    const ws = wb.addWorksheet(safeName);

    if (rows.length === 0) return wb;

    const keys = headers ? Object.keys(headers) : Object.keys(rows[0] as object);
    const labels = headers ? keys.map(k => headers[k]) : keys;

    // Fila de encabezado con estilo formal
    const headerRow = ws.addRow(labels);
    headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: HEADER_TEXT }, name: 'Calibri' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_ARGB } };
        cell.alignment = { vertical: 'middle' };
    });
    headerRow.height = 22;

    // Filas de datos con Zebra Striping (filas intercaladas en azul claro)
    rows.forEach((row, idx) => {
        const values = keys.map(k => (row as Record<string, unknown>)[k] ?? '');
        const dataRow = ws.addRow(values);
        if (idx % 2 === 1) {
            dataRow.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } };
            });
        }
    });

    // Auto-ajuste dinámico de ancho de columnas (máximo 60 caracteres)
    keys.forEach((k, i) => {
        const label = labels[i];
        const maxLen = rows.reduce(
            (max, r) => Math.max(max, String((r as Record<string, unknown>)[k] ?? '').length),
            label.length,
        );
        ws.getColumn(i + 1).width = Math.min(maxLen + 2, 60);
    });

    return wb;
}

/** * Serializa un workbook de ExcelJS directamente a un Buffer binario.
 */
export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}

/** * Genera un nombre de archivo seguro con la hora oficial de Perú (UTC-5).
 * Evita el comportamiento de .toISOString() que fuerza el formato a UTC absoluto.
 */
export function buildFilename(base: string): string {
    const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };

    // Devuelve la cadena formateada en formato peruano: "DD/MM/AAAA, HH:MM"
    const localString = new Date().toLocaleString('es-PE', options);

    const [fecha, hora] = localString.split(', ');
    const [dia, mes, anio] = fecha.split('/');
    const [hh, mm] = hora.split(':');

    const stamp = `${anio}${mes}${dia}_${hh}${mm}`;
    return `${base}_${stamp}`;
}

/**
 * Manejador unificado y polimórfico de descargas institucionales para EduAula.
 * Soporta JSON en caliente, CSV plano, Excel estructurado y exportación a PDF.
 */
export async function handleUnifiedExport(
    res: Response,
    data: any[],
    columns: ExportColumnMap,
    baseFilename: string,
    format: 'xlsx' | 'pdf' | 'csv' | 'json' = 'json',
    pdfBuilder?: any // Inyección dinámica opcional de tu constructor AttendancePdfBuilder
) {
    // Genera el cuerpo base limpio del archivo: "Reporte_Asistencia_20260604_0115"
    const filename = buildFilename(baseFilename);

    switch (format) {
        case 'json':
            res.setHeader('Content-Type', 'application/json');
            return res.send(data);

        case 'csv':
            const csvContent = convertToCsv(data, columns);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            // CORREGIDO: Concatenación limpia de la extensión .csv sin duplicaciones
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            return res.send(Buffer.from('\uFEFF' + csvContent, 'utf-8')); // Incorpora el BOM para Excel local

        case 'xlsx':
            const wb = buildXlsx(baseFilename.substring(0, 30), data, columns);
            const buf = await workbookToBuffer(wb);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            // CORREGIDO: Concatenación limpia de la extensión .xlsx
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            return res.send(buf);

        case 'pdf':
            if (!pdfBuilder) {
                res.setHeader('Content-Type', 'application/json');
                return res.status(500).send({ message: 'El motor constructor de PDF no fue inyectado' });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);

            // Cálculo del ancho proporcional para evitar desbordes en PDFKit (A4 usable = 515pt)
            const headers = Object.values(columns);
            const keys = Object.keys(columns);
            const count = headers.length;
            const widthPerColumn = Math.floor(515 / count);
            const widths = Array(count).fill(widthPerColumn);

            const pdfBuffer = await pdfBuilder.buildTablePdf(data, {
                title: baseFilename.replace(/_/g, ' '),
                headers: headers,
                keys: keys,
                columnWidths: widths
            });

            return res.send(pdfBuffer);
    }
}

/**
 * Parsea un arreglo JSON plano en un formato de texto separado por comas estándar.
 */
function convertToCsv(data: any[], columns: ExportColumnMap): string {
    const keys = Object.keys(columns);
    const headers = Object.values(columns).join(',');

    const rows = data.map(row =>
        keys.map(key => {
            const val = row[key];
            if (val === null || val === undefined) return '""';
            // Escapa comillas dobles internas para no romper celdas complejas
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
    );

    return [headers, ...rows].join('\n');
}