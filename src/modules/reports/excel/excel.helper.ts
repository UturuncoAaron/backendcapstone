import { utils, write, type WorkBook } from 'xlsx';

/**
 * Construye un Workbook de Excel a partir de filas JSON usando SheetJS.
 *
 * @param sheetName  Nombre de la hoja (max 31 chars).
 * @param rows       Datos como array de objetos planos.
 * @param headers    Mapa opcional `{ key: 'Etiqueta humana' }` para forzar
 *                   orden y traducir nombres de columna.
 */
export function buildXlsx(
  sheetName: string,
  rows: readonly object[],
  headers?: Record<string, string>,
): WorkBook {
  const wb = utils.book_new();

  let sheet;
  if (headers) {
    const keys = Object.keys(headers);
    const matrix: unknown[][] = [
      keys.map((k) => headers[k]),
      ...rows.map((row) =>
        keys.map((k) => (row as Record<string, unknown>)[k] ?? ''),
      ),
    ];
    sheet = utils.aoa_to_sheet(matrix);
  } else {
    sheet = utils.json_to_sheet(rows as object[]);
  }

  // Excel limita el nombre de hoja a 31 chars.
  const safeName = sheetName.slice(0, 31);
  utils.book_append_sheet(wb, sheet, safeName);
  return wb;
}

/** Serializa un workbook a Buffer xlsx (usable con res.send / res.attachment). */
export function workbookToBuffer(wb: WorkBook): Buffer {
  // xlsx declara `any` para el retorno; en runtime es siempre Buffer.
  return write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Genera un nombre de archivo seguro con timestamp ISO corto. */
export function buildFilename(base: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
  return `${base}_${stamp}.xlsx`;
}
