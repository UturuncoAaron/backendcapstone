import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

// ── Paleta compartida ─────────────────────────────────────────────────────────
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
    purple: '6B21A8',
    purpleBg: 'FAF5FF',
    teal: '0F766E',
    tealBg: 'F0FDFA',
};

const fill = (argb: string): ExcelJS.FillPattern => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const font = (opts: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> => ({ name: 'Calibri', ...opts });
const borderH = (): Partial<ExcelJS.Borders> => ({ bottom: { style: 'hair', color: { argb: C.gray200 } } });

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS — AttendanceXlsxBuilder (asistencia por curso)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// AttendanceXlsxBuilder — Excel de asistencia por curso (docente)
// ═══════════════════════════════════════════════════════════════════════════════
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

    private sheetResumen(wb: ExcelJS.Workbook, d: AsistenciaCursoExcelData) {
        const ws = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: C.darkBlue } } });
        ws.columns = [
            { width: 28 },
            { width: 8 },
            { width: 9 },
            { width: 9 },
            { width: 9 },
            { width: 9 },
            { width: 12 },
        ];
        let r = 1;

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

        const total = d.summary.length;
        if (total > 0) {
            const promPct = Math.round(d.summary.reduce((s, a) => s + Number(a.pct_asistencia), 0) / total);
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
                cell.font = font({ size: 16, bold: true, color: { argb: i === 1 ? (promPct >= 80 ? C.green : promPct >= 60 ? C.amber : C.red) : C.navy } });
            }
            r += 2;
        }

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

        for (let i = 0; i < d.summary.length; i++) {
            const a = d.summary[i];
            const pct = Number(a.pct_asistencia);
            const stripe = i % 2 === 1;
            const nombre = [a.apellido_paterno, a.apellido_materno, a.nombre].filter(Boolean).join(', ');
            const rowData = [nombre, a.total, a.presente, a.tardanza, a.justificado, a.ausente, pct / 100];

            for (let j = 0; j < rowData.length; j++) {
                const cell = ws.getCell(r, j + 1);
                cell.value = rowData[j];
                cell.border = borderH();
                if (stripe) cell.fill = fill(C.gray50);
                cell.alignment = { vertical: 'middle', horizontal: j === 0 ? 'left' : 'center' };

                if (j === 2) cell.font = font({ size: 11, color: { argb: C.green }, bold: a.presente > 0 });
                else if (j === 3) cell.font = font({ size: 11, color: { argb: C.amber }, bold: a.tardanza > 0 });
                else if (j === 4) cell.font = font({ size: 11, color: { argb: C.blue }, bold: a.justificado > 0 });
                else if (j === 5) cell.font = font({ size: 11, color: { argb: C.red }, bold: a.ausente > 0 });
                else if (j === 6) {
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
                ? (tots.presente + tots.tardanza + tots.justificado) / tots.total : 0;
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

    private sheetDetalle(wb: ExcelJS.Workbook, d: AsistenciaCursoExcelData) {
        const ws = wb.addWorksheet('Detalle diario', { properties: { tabColor: { argb: C.green } } });
        ws.columns = [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 35 }];
        let r = 1;

        ws.mergeCells(r, 1, r, 4);
        ws.getCell(r, 1).value = `Detalle diario — ${d.meta.curso_nombre}`;
        ws.getCell(r, 1).font = font({ bold: true, size: 13, color: { argb: C.navy } });
        r += 2;

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
            const nombre = [det.apellido_paterno, det.apellido_materno, det.nombre].filter(Boolean).join(', ');
            const colores = estadoColorMap[det.estado] ?? { fg: C.gray500, bg: C.gray50 };
            const rowData = [nombre, fmtDate(det.fecha), capitalize(det.estado), det.observacion ?? '—'];

            for (let j = 0; j < rowData.length; j++) {
                const cell = ws.getCell(r, j + 1);
                cell.value = rowData[j];
                cell.border = borderH();
                if (j === 2) {
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

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS — PersonalXlsxBuilder (asistencia de todo el personal)
// ═══════════════════════════════════════════════════════════════════════════════

const ESTADO_LABEL: Record<string, string> = {
    presente: 'Presente',
    tardanza: 'Tardanza',
    falto: 'Faltó',
    justificado: 'Justificado',
    'sin-registro': '—',
};

const ESTADO_COLOR: Record<string, { fg: string; bg: string }> = {
    presente: { fg: C.green, bg: C.greenBg },
    tardanza: { fg: C.amber, bg: C.amberBg },
    falto: { fg: C.red, bg: C.redBg },
    justificado: { fg: C.blue, bg: C.blueBg },
    'sin-registro': { fg: C.gray500, bg: C.gray100 },
};

const ROL_COLOR: Record<string, { fg: string; bg: string }> = {
    admin: { fg: C.purple, bg: C.purpleBg },
    docente: { fg: C.blue, bg: C.blueBg },
    psicologa: { fg: '86198F', bg: 'FDF4FF' },
    staff: { fg: C.teal, bg: C.tealBg },
};

const ROL_LABEL: Record<string, string> = {
    admin: 'Administrador',
    docente: 'Docente',
    psicologa: 'Psicóloga',
    staff: 'Staff',
};

export interface ResumenPersonalRow {
    cuenta_id: string;
    rol: string;
    codigo_acceso: string;
    nombre_completo: string;
    cargo: string;
    total_esperados: number;
    presentes: number;
    tardanzas: number;
    faltos: number;
    justificados: number;
    sin_registro: number;
    porcentaje_asistencia: number | null;
}

export interface DetallePersonalRow {
    cuenta_id: string;
    rol: string;
    codigo_acceso: string;
    nombre_completo: string;
    cargo: string;
    fecha: string;
    estado: string;
    hora_entrada: string | null;
    hora_salida: string | null;
    hora_entrada_esperada: string | null;
    hora_salida_esperada: string | null;
    motivo_justificacion: string | null;
    observacion: string | null;
}

export interface PersonalExcelData {
    meta: {
        fecha_inicio: string;
        fecha_fin: string;
        generado_en: string;
        filtro_rol?: string;
    };
    resumen: ResumenPersonalRow[];
    detalle: DetallePersonalRow[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PersonalXlsxBuilder — Excel consolidado de todo el personal
// ═══════════════════════════════════════════════════════════════════════════════
@Injectable()
export class PersonalXlsxBuilder {

    async build(data: PersonalExcelData): Promise<Buffer> {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'EduAula';
        wb.created = new Date();

        this.sheetResumenGeneral(wb, data);

        const roles = ['admin', 'docente', 'psicologa', 'staff'] as const;
        for (const rol of roles) {
            const rowsRol = data.resumen.filter(r => r.rol === rol);
            if (rowsRol.length > 0) this.sheetResumenRol(wb, data, rowsRol, rol);
        }

        this.sheetDetalleDias(wb, data);

        return Buffer.from(await wb.xlsx.writeBuffer());
    }

    private sheetResumenGeneral(wb: ExcelJS.Workbook, d: PersonalExcelData) {
        const ws = wb.addWorksheet('Resumen General', { properties: { tabColor: { argb: C.navy } } });
        ws.columns = [
            { width: 30 }, { width: 14 }, { width: 22 }, { width: 10 },
            { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 },
            { width: 12 }, { width: 12 },
        ];

        let r = 1;
        ws.mergeCells(r, 1, r, 10);
        ws.getCell(r, 1).value = 'Reporte de Asistencia del Personal — EduAula';
        ws.getCell(r, 1).font = font({ bold: true, size: 14, color: { argb: C.navy } });
        r++;

        ws.mergeCells(r, 1, r, 10);
        ws.getCell(r, 1).value = `Del ${fmtDate(d.meta.fecha_inicio)} al ${fmtDate(d.meta.fecha_fin)}  ·  Generado: ${fmtDateTime(d.meta.generado_en)}`;
        ws.getCell(r, 1).font = font({ size: 9, color: { argb: C.gray500 } });
        r += 2;

        const totales = this.calcTotales(d.resumen);
        const statHeaders = ['Total Personal', 'Presentes', 'Tardanzas', 'Faltos', '% Promedio'];
        const statVals = [d.resumen.length, totales.presentes, totales.tardanzas, totales.faltos, totales.pct !== null ? `${totales.pct}%` : '—'];
        for (let i = 0; i < 5; i++) {
            ws.getCell(r, i * 2 + 1).value = statHeaders[i];
            ws.getCell(r, i * 2 + 1).font = font({ size: 9, bold: true, color: { argb: C.gray500 } });
        }
        r++;
        for (let i = 0; i < 5; i++) {
            const cell = ws.getCell(r, i * 2 + 1);
            cell.value = statVals[i];
            cell.font = font({ size: 16, bold: true, color: { argb: C.navy } });
        }
        r += 2;

        const headers = ['Colaborador', 'Rol', 'Cargo', 'Esperados', 'Presentes', 'Tardanzas', 'Faltos', 'Justificados', 'Sin registro', '% Asistencia'];
        for (let i = 0; i < headers.length; i++) {
            const cell = ws.getCell(r, i + 1);
            cell.value = headers[i];
            cell.font = font({ bold: true, size: 11, color: { argb: C.white } });
            cell.fill = fill(C.navy);
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
        }
        ws.getRow(r).height = 24;
        r++;

        for (let i = 0; i < d.resumen.length; i++) {
            const row = d.resumen[i];
            const pct = Number(row.porcentaje_asistencia ?? 0);
            const stripe = i % 2 === 1;
            const rolC = ROL_COLOR[row.rol] ?? { fg: C.gray500, bg: C.gray100 };
            const values = [
                row.nombre_completo, ROL_LABEL[row.rol] ?? row.rol, row.cargo,
                row.total_esperados, row.presentes, row.tardanzas, row.faltos,
                row.justificados, row.sin_registro,
                row.porcentaje_asistencia !== null ? pct / 100 : null,
            ];

            for (let j = 0; j < values.length; j++) {
                const cell = ws.getCell(r, j + 1);
                cell.value = values[j];
                cell.border = borderH();
                cell.alignment = { vertical: 'middle', horizontal: j === 0 ? 'left' : 'center' };

                if (j === 1) {
                    cell.font = font({ size: 10, bold: true, color: { argb: rolC.fg } });
                    cell.fill = fill(rolC.bg);
                } else if (j === 4) {
                    cell.font = font({ size: 11, color: { argb: C.green }, bold: row.presentes > 0 });
                    if (stripe) cell.fill = fill(C.greenBg);
                } else if (j === 5) {
                    cell.font = font({ size: 11, color: { argb: C.amber }, bold: row.tardanzas > 0 });
                    if (stripe) cell.fill = fill(C.amberBg);
                } else if (j === 6) {
                    cell.font = font({ size: 11, color: { argb: C.red }, bold: row.faltos > 0 });
                    if (stripe) cell.fill = fill(C.redBg);
                } else if (j === 9 && row.porcentaje_asistencia !== null) {
                    cell.numFmt = '0.0%';
                    const color = pct >= 80 ? C.green : pct >= 60 ? C.amber : C.red;
                    const bgMap: Record<string, string> = { [C.green]: C.greenBg, [C.amber]: C.amberBg, [C.red]: C.redBg };
                    cell.font = font({ size: 11, bold: true, color: { argb: color } });
                    cell.fill = fill(bgMap[color]);
                } else {
                    cell.font = font({ size: 11, color: { argb: C.gray900 } });
                    if (stripe) cell.fill = fill(C.gray50);
                }
            }
            r++;
        }

        if (d.resumen.length > 1) {
            r++;
            const totRow = ['TOTALES', '', '', totales.esperados, totales.presentes, totales.tardanzas, totales.faltos, totales.justificados, totales.sinRegistro, totales.pct !== null ? totales.pct / 100 : null];
            for (let j = 0; j < totRow.length; j++) {
                const cell = ws.getCell(r, j + 1);
                cell.value = totRow[j];
                cell.fill = fill(C.gray100);
                cell.font = font({ bold: true, size: 11, color: { argb: C.navy } });
                cell.alignment = { horizontal: j === 0 ? 'left' : 'center' };
                if (j === 9 && totales.pct !== null) cell.numFmt = '0.0%';
            }
        }
    }

    private sheetResumenRol(wb: ExcelJS.Workbook, d: PersonalExcelData, rows: ResumenPersonalRow[], rol: string) {
        const rolC = ROL_COLOR[rol] ?? { fg: C.navy, bg: C.gray50 };
        const label = ROL_LABEL[rol] ?? rol;
        const ws = wb.addWorksheet(label, { properties: { tabColor: { argb: rolC.fg } } });

        ws.columns = [
            { width: 30 }, { width: 22 }, { width: 10 }, { width: 10 },
            { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 },
        ];

        let r = 1;
        ws.mergeCells(r, 1, r, 9);
        ws.getCell(r, 1).value = `Asistencia — ${label}`;
        ws.getCell(r, 1).font = font({ bold: true, size: 13, color: { argb: rolC.fg } });
        r++;

        ws.mergeCells(r, 1, r, 9);
        ws.getCell(r, 1).value = `Del ${fmtDate(d.meta.fecha_inicio)} al ${fmtDate(d.meta.fecha_fin)}`;
        ws.getCell(r, 1).font = font({ size: 9, color: { argb: C.gray500 } });
        r += 2;

        const headers = ['Colaborador', 'Cargo', 'Esperados', 'Presentes', 'Tardanzas', 'Faltos', 'Justificados', 'Sin registro', '% Asistencia'];
        for (let i = 0; i < headers.length; i++) {
            const cell = ws.getCell(r, i + 1);
            cell.value = headers[i];
            cell.font = font({ bold: true, size: 11, color: { argb: C.white } });
            cell.fill = fill(rolC.fg);
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
        }
        ws.getRow(r).height = 24;
        r++;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const pct = Number(row.porcentaje_asistencia ?? 0);
            const stripe = i % 2 === 1;
            const values = [
                row.nombre_completo, row.cargo, row.total_esperados, row.presentes,
                row.tardanzas, row.faltos, row.justificados, row.sin_registro,
                row.porcentaje_asistencia !== null ? pct / 100 : null,
            ];

            for (let j = 0; j < values.length; j++) {
                const cell = ws.getCell(r, j + 1);
                cell.value = values[j];
                cell.border = borderH();
                cell.alignment = { vertical: 'middle', horizontal: j === 0 ? 'left' : 'center' };

                if (j === 8 && row.porcentaje_asistencia !== null) {
                    cell.numFmt = '0.0%';
                    const color = pct >= 80 ? C.green : pct >= 60 ? C.amber : C.red;
                    const bgMap: Record<string, string> = { [C.green]: C.greenBg, [C.amber]: C.amberBg, [C.red]: C.redBg };
                    cell.font = font({ size: 11, bold: true, color: { argb: color } });
                    cell.fill = fill(bgMap[color]);
                } else {
                    cell.font = font({ size: 11, color: { argb: C.gray900 } });
                    if (stripe) cell.fill = fill(C.gray50);
                }
            }
            r++;
        }
    }

    private sheetDetalleDias(wb: ExcelJS.Workbook, d: PersonalExcelData) {
        // ── Construir pivot: persona x dia ───────────────────────────────────
        const fechasSet = new Set<string>();
        const porPersona = new Map<string, { row: DetallePersonalRow; dias: Map<string, DetallePersonalRow> }>();

        for (const row of d.detalle) {
            fechasSet.add(row.fecha);
            if (!porPersona.has(row.cuenta_id)) {
                porPersona.set(row.cuenta_id, { row, dias: new Map() });
            }
            porPersona.get(row.cuenta_id)!.dias.set(row.fecha, row);
        }

        const fechas = Array.from(fechasSet).sort();
        const personas = Array.from(porPersona.values());
        const totalCols = 2 + fechas.length; // Colaborador + Rol + N días

        const ABREV: Record<string, string> = {
            presente: 'P',
            tardanza: 'T',
            falto: 'F',
            justificado: 'J',
            'sin-registro': '—',
        };

        const ws = wb.addWorksheet('Detalle por Día', { properties: { tabColor: { argb: C.teal } } });

        // Anchos: nombre(30) + rol(12) + cada día(8)
        ws.columns = [
            { width: 30 },
            { width: 12 },
            ...fechas.map(() => ({ width: 9 })),
        ];

        let r = 1;
        ws.mergeCells(r, 1, r, totalCols);
        ws.getCell(r, 1).value = `Detalle Diario del Personal — Del ${fmtDate(d.meta.fecha_inicio)} al ${fmtDate(d.meta.fecha_fin)}`;
        ws.getCell(r, 1).font = font({ bold: true, size: 13, color: { argb: C.navy } });
        r++;

        ws.mergeCells(r, 1, r, totalCols);
        ws.getCell(r, 1).value = 'P = Presente  ·  T = Tardanza  ·  F = Faltó  ·  J = Justificado  ·  — = Sin registro';
        ws.getCell(r, 1).font = font({ size: 8, italic: true, color: { argb: C.gray500 } });
        r += 2;

        // Cabecera fija
        const hdrNombre = ws.getCell(r, 1);
        hdrNombre.value = 'Colaborador';
        hdrNombre.font = font({ bold: true, size: 11, color: { argb: C.white } });
        hdrNombre.fill = fill(C.navy);
        hdrNombre.alignment = { vertical: 'middle' };

        const hdrRol = ws.getCell(r, 2);
        hdrRol.value = 'Rol';
        hdrRol.font = font({ bold: true, size: 11, color: { argb: C.white } });
        hdrRol.fill = fill(C.navy);
        hdrRol.alignment = { vertical: 'middle', horizontal: 'center' };

        // Cabecera de días — DD/MM arriba, día de semana abajo
        for (let fi = 0; fi < fechas.length; fi++) {
            const cell = ws.getCell(r, 3 + fi);
            const d2 = new Date(fechas[fi] + 'T00:00:00');
            const diaSemana = d2.toLocaleDateString('es-PE', { weekday: 'short', timeZone: 'America/Lima' });
            cell.value = `${pad(d2.getDate())}/${pad(d2.getMonth() + 1)}\n${diaSemana}`;
            cell.font = font({ bold: true, size: 9, color: { argb: C.white } });
            cell.fill = fill(C.navy);
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        }
        ws.getRow(r).height = 30;
        r++;

        // Filas de personas
        for (let pi = 0; pi < personas.length; pi++) {
            const { row: persona, dias } = personas[pi];
            const stripe = pi % 2 === 1;
            const rolC = ROL_COLOR[persona.rol] ?? { fg: C.gray500, bg: C.gray100 };

            const cNombre = ws.getCell(r, 1);
            cNombre.value = persona.nombre_completo;
            cNombre.font = font({ size: 11, bold: true, color: { argb: C.gray900 } });
            cNombre.border = borderH();
            if (stripe) cNombre.fill = fill(C.gray50);

            const cRol = ws.getCell(r, 2);
            cRol.value = ROL_LABEL[persona.rol] ?? persona.rol;
            cRol.font = font({ size: 9, bold: true, color: { argb: rolC.fg } });
            cRol.fill = fill(rolC.bg);
            cRol.alignment = { horizontal: 'center' };
            cRol.border = borderH();

            for (let fi = 0; fi < fechas.length; fi++) {
                const diaRow = dias.get(fechas[fi]);
                const estado = diaRow?.estado ?? 'sin-registro';
                const estC = ESTADO_COLOR[estado] ?? ESTADO_COLOR['sin-registro'];
                const cell = ws.getCell(r, 3 + fi);

                cell.value = ABREV[estado] ?? '—';
                cell.font = font({ size: 11, bold: estado !== 'sin-registro', color: { argb: estC.fg } });
                cell.fill = fill(estC.bg);
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = borderH();
            }
            r++;
        }
    }

    private calcTotales(rows: ResumenPersonalRow[]) {
        const esperados = rows.reduce((s, r) => s + r.total_esperados, 0);
        const presentes = rows.reduce((s, r) => s + r.presentes, 0);
        const tardanzas = rows.reduce((s, r) => s + r.tardanzas, 0);
        const faltos = rows.reduce((s, r) => s + r.faltos, 0);
        const justificados = rows.reduce((s, r) => s + r.justificados, 0);
        const sinRegistro = rows.reduce((s, r) => s + r.sin_registro, 0);
        const pct = esperados > 0 ? Math.round(100 * (presentes + tardanzas) / esperados) : null;
        return { esperados, presentes, tardanzas, faltos, justificados, sinRegistro, pct };
    }
}

// ── Helpers compartidos ───────────────────────────────────────────────────────
function fmtDate(v: string | null | undefined): string {
    if (!v) return '—';
    const d = new Date(v + 'T00:00:00');
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