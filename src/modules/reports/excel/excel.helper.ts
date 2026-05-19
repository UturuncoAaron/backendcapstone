import * as ExcelJS from 'exceljs';
const HEADER_ARGB = '1E3A5F';
const HEADER_TEXT = 'FFFFFF';

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

  // Fila de encabezado con estilo
  const headerRow = ws.addRow(labels);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_ARGB } };
    cell.alignment = { vertical: 'middle' };
  });
  headerRow.height = 22;

  // Filas de datos con stripe
  rows.forEach((row, idx) => {
    const values = keys.map(k => (row as Record<string, unknown>)[k] ?? '');
    const dataRow = ws.addRow(values);
    if (idx % 2 === 1) {
      dataRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } };
      });
    }
  });

  // Auto-ancho de columnas (máx 60 chars)
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

/** Serializa un workbook a Buffer xlsx. */
export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Genera un nombre de archivo seguro con timestamp ISO corto. */
export function buildFilename(base: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
  return `${base}_${stamp}.xlsx`;
}