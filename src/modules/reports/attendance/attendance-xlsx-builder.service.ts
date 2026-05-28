import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
    navy: '1E3A5F',
    darkBlue: '1565C0',
    white: 'FFFFFF',
    gray50: 'F8FAFC',
    gray100: 'F1F5F9',
    gray200: 'E2E8F0',
    gray500: '64748B',
    gray900: '0F172A',
    green: '2E7D32',
    greenBg: 'E8F5E9',
    amber: 'E65100',
    amberBg: 'FFF3E0',
    red: 'C62828',
    redBg: 'FFEBEE',
    blue: '1565C0',
    blueBg: 'E3F2FD',
};

const fill = (argb: string): ExcelJS.FillPattern => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const font = (opts: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> => ({ name: 'Calibri', ...opts });
const border = (): Partial<ExcelJS.Borders> => ({ bottom: { style: 'hair', color: { argb: C.gray200 } } });

export interface AsistenciaSummaryRow {
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    total: number;
    presente: number;
    tardanza: number;
    justificado: number;
    ausente: number;
    pct_asistencia: number;
}

export interface AsistenciaDetalleRow {
    apellido_paterno: string;
    apellido_materno: string | null;
    nombre: string;
    fecha: string;
    estado: string;
    observacion: string | null;
}

export interface AsistenciaCursoExcelData {
    meta: {
        curso_nombre: string;
        periodo_nombre?: string;
        desde?: string;
        hasta?: string;
        generado_en: string;
    };
    summary: AsistenciaSummaryRow[];
    detalle: AsistenciaDetalleRow[];
}

@Injectable()
export class AttendanceXlsxBuilder {

    async build(data: AsistenciaCursoExcelData): Promise<Buffer> {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'EduAula';
        wb.created = new Date();

        this.sheetResumen(wb, data);
        this.sheetDetalle(wb, data);

        return Buffer.from(await wb.xlsx.writeBuffer());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HOJA 1 — RESUMEN POR ALUMNO
    // ═══════════════════════════════════════════════════════════════════════════
    private sheetResumen(wb: ExcelJS.Workbook, d: AsistenciaCursoExcelData) {
        const ws = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: C.darkBlue } } });
        ws.columns = [
            { width: 28 }, // Alumno
            { width: 8 }, // Tot
            { width: 9 }, // Pres
            { width: 9 }, // Tard
            { width: 9 }, // Just
            { width: 9 }, // Aus
            { width: 12 }, // %
        ];
        let r = 1;

        // ── Título ──
        ws.mergeCells(r, 1, r, 7);
        ws.getCell(r, 1).value = `Reporte de Asistencia — ${d.meta.curso_nombre}`;
        ws.getCell(r, 1).font = font({ bold: true, size: 14, color: { argb: C.navy } });
        r++;

        ws.mergeCells(r, 1, r, 7);
        const subtitulo: string[] = [];
        if (d.meta.periodo_nombre) subtitulo.push(d.meta.periodo_nombre);
        if (d.meta.desde && d.meta.hasta) subtitulo.push(`Del ${fmtDate(d.meta.desde)} al ${fmtDate(d.meta.hasta)}`);
        else if (d.meta.desde) subtitulo.push(`Desde ${fmtDate(d.meta.desde)}`);
        else if (d.meta.hasta) subtitulo.push(`Hasta ${fmtDate(d.meta.hasta)}`);
        ws.getCell(r, 1).value = subtitulo.join('  ·  ') || 'Período completo';
        ws.getCell(r, 1).font = font({ size: 10, color: { argb: C.gray500 } });
        r++;

        ws.mergeCells(r, 1, r, 7);
        ws.getCell(r, 1).value = `Generado: ${fmtDateTime(d.meta.generado_en)}`;
        ws.getCell(r, 1).font = font({ size: 9, color: { argb: C.gray500 } });
        r += 2;

        // ── Stats globales ──
        const total = d.summary.length;
        if (total > 0) {
            const promPct = Math.round(
                d.summary.reduce((s, a) => s + Number(a.pct_asistencia), 0) / total,
            );
            const conFaltas = d.summary.filter(a => a.ausente > 0).length;

            const statHeaders = ['Alumnos', 'Promedio %', 'Con faltas'];
            const statVals = [total, `${promPct}%`, conFaltas];
            for (let i = 0; i < 3; i++) {
                ws.getCell(r, i * 2 + 1).value = statHeaders[i];
                ws.getCell(r, i * 2 + 1).font = font({ size: 9, bold: true, color: { argb: C.gray500 } });
            }
            r++;
            for (let i = 0; i < 3; i++) {
                const cell = ws.getCell(r, i * 2 + 1);
                cell.value = statVals[i];
                cell.font = font({
                    size: 16, bold: true, color: {
                        argb: i === 1
                            ? (promPct >= 80 ? C.green : promPct >= 60 ? C.amber : C.red)
                            : C.navy,
                    }
                });
            }
            r += 2;
        }

        // ── Cabecera tabla ──
        const headers = ['Alumno', 'Total', 'Presente', 'Tardanza', 'Justif.', 'Ausente', '% Asist.'];
        const hdrColors = [C.navy, C.navy, C.green, C.amber, C.blue, C.red, C.navy];
        for (let i = 0; i < headers.length; i++) {
            const cell = ws.getCell(r, i + 1);
            cell.value = headers[i];
            cell.font = font({ bold: true, size: 11, color: { argb: C.white } });
            cell.fill = fill(hdrColors[i]);
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
        }
        ws.getRow(r).height = 24;
        r++;

        // ── Filas de datos ──
        for (let i = 0; i < d.summary.length; i++) {
            const a = d.summary[i];
            const pct = Number(a.pct_asistencia);
            const stripe = i % 2 === 1;

            const nombreCompleto = [a.apellido_paterno, a.apellido_materno, a.nombre]
                .filter(Boolean).join(', ');

            const rowData = [
                nombreCompleto,
                a.total,
                a.presente,
                a.tardanza,
                a.justificado,
                a.ausente,
                pct / 100,  // formato porcentaje de Excel
            ];

            for (let j = 0; j < rowData.length; j++) {
                const cell = ws.getCell(r, j + 1);
                cell.value = rowData[j];
                cell.border = border();
                if (stripe) cell.fill = fill(C.gray50);
                cell.alignment = { vertical: 'middle', horizontal: j === 0 ? 'left' : 'center' };

                // Fuente para columnas de color
                if (j === 2) cell.font = font({ size: 11, color: { argb: C.green }, bold: a.presente > 0 });
                else if (j === 3) cell.font = font({ size: 11, color: { argb: C.amber }, bold: a.tardanza > 0 });
                else if (j === 4) cell.font = font({ size: 11, color: { argb: C.blue }, bold: a.justificado > 0 });
                else if (j === 5) cell.font = font({ size: 11, color: { argb: C.red }, bold: a.ausente > 0 });
                else if (j === 6) {
                    // Columna % — formato y color dinámico
                    cell.numFmt = '0.0%';
                    const color = pct >= 80 ? C.green : pct >= 60 ? C.amber : C.red;
                    const bgMap: Record<string, string> = { [C.green]: C.greenBg, [C.amber]: C.amberBg, [C.red]: C.redBg };
                    cell.font = font({ size: 11, bold: true, color: { argb: color } });
                    cell.fill = fill(bgMap[color] ?? C.gray50);
                } else {
                    cell.font = font({ size: 11, color: { argb: C.gray900 } });
                }
            }
            r++;
        }

        // ── Fila de totales ──
        if (d.summary.length > 1) {
            r++;
            const tots = {
                total: d.summary.reduce((s, a) => s + a.total, 0),
                presente: d.summary.reduce((s, a) => s + a.presente, 0),
                tardanza: d.summary.reduce((s, a) => s + a.tardanza, 0),
                justificado: d.summary.reduce((s, a) => s + a.justificado, 0),
                ausente: d.summary.reduce((s, a) => s + a.ausente, 0),
            };
            const promGlobal = tots.total > 0
                ? (tots.presente + tots.tardanza + tots.justificado) / tots.total
                : 0;

            const totRow = ['TOTALES', tots.total, tots.presente, tots.tardanza, tots.justificado, tots.ausente, promGlobal];
            for (let j = 0; j < totRow.length; j++) {
                const cell = ws.getCell(r, j + 1);
                cell.value = totRow[j];
                cell.fill = fill(C.gray100);
                cell.font = font({ bold: true, size: 11, color: { argb: C.navy } });
                cell.alignment = { horizontal: j === 0 ? 'left' : 'center' };
                if (j === 6) cell.numFmt = '0.0%';
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HOJA 2 — DETALLE DIARIO
    // ═══════════════════════════════════════════════════════════════════════════
    private sheetDetalle(wb: ExcelJS.Workbook, d: AsistenciaCursoExcelData) {
        const ws = wb.addWorksheet('Detalle diario', { properties: { tabColor: { argb: C.green } } });
        ws.columns = [
            { width: 28 }, // Alumno
            { width: 14 }, // Fecha
            { width: 14 }, // Estado
            { width: 35 }, // Observación
        ];
        let r = 1;

        ws.mergeCells(r, 1, r, 4);
        ws.getCell(r, 1).value = `Detalle diario — ${d.meta.curso_nombre}`;
        ws.getCell(r, 1).font = font({ bold: true, size: 13, color: { argb: C.navy } });
        r += 2;

        // Cabecera
        ['Alumno', 'Fecha', 'Estado', 'Observación'].forEach((h, i) => {
            const cell = ws.getCell(r, i + 1);
            cell.value = h;
            cell.font = font({ bold: true, size: 11, color: { argb: C.white } });
            cell.fill = fill(C.navy);
            cell.alignment = { vertical: 'middle' };
        });
        ws.getRow(r).height = 22;
        r++;

        const estadoColorMap: Record<string, { fg: string; bg: string }> = {
            asistio: { fg: C.green, bg: C.greenBg },
            tardanza: { fg: C.amber, bg: C.amberBg },
            justificado: { fg: C.blue, bg: C.blueBg },
            falta: { fg: C.red, bg: C.redBg },
        };

        for (let i = 0; i < d.detalle.length; i++) {
            const det = d.detalle[i];
            const stripe = i % 2 === 1;
            const nombre = [det.apellido_paterno, det.apellido_materno, det.nombre]
                .filter(Boolean).join(', ');
            const colores = estadoColorMap[det.estado] ?? { fg: C.gray500, bg: C.gray50 };

            const rowData = [nombre, fmtDate(det.fecha), capitalize(det.estado), det.observacion ?? '—'];
            for (let j = 0; j < rowData.length; j++) {
                const cell = ws.getCell(r, j + 1);
                cell.value = rowData[j];
                cell.border = border();
                if (j === 2) {
                    // Estado — color dinámico
                    cell.font = font({ size: 11, bold: true, color: { argb: colores.fg } });
                    cell.fill = fill(colores.bg);
                } else {
                    cell.font = font({ size: 11, color: { argb: C.gray900 } });
                    if (stripe) cell.fill = fill(C.gray50);
                }
            }
            r++;
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(v: string | null | undefined): string {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDateTime(v: string): string {
    const d = new Date(v);
    return `${fmtDate(v)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function capitalize(s: string): string {
    if (!s) return '—';
    const map: Record<string, string> = {
        asistio: 'Presente', tardanza: 'Tardanza',
        justificado: 'Justificado', falta: 'Faltó',
    };
    return map[s] ?? (s.charAt(0).toUpperCase() + s.slice(1));
}