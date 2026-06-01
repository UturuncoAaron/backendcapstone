import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { TeacherAttendanceService } from './teacher-attendance.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
    ReporteDiarioDocenteQueryDto,
    ReporteRangoDocenteQueryDto,
    AlertasAusenciaDocenteQueryDto,
} from '../dto/teacher-attendance.dto.js';
import { workbookToBuffer, buildFilename } from '../excel/excel.helper.js';

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
    navy: '1E3A5F',
    darkBlue: '1E3A8A',
    white: 'FFFFFF',
    paleBlue: 'EFF6FF',
    gray900: '0F172A',
    green: '166534',
    amber: '92400E',
    red: '991B1B',
    blue: '1E40AF',
    teal: '0F766E',
    totalBg: 'E2E8F0',
    dateBg: 'DBEAFE',
    dateFont: '1E3A8A',
    matrizP: 'D1FAE5',   // verde claro — Presente
    matrizT: 'FEF3C7',   // ámbar claro — Tardanza
    matrizF: 'FEE2E2',   // rojo claro  — Falta
    matrizJ: 'DBEAFE',   // azul claro  — Justificado
};

const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: C.white }, size: 11, name: 'Calibri' };
const DATA_FONT: Partial<ExcelJS.Font> = { size: 10, color: { argb: C.gray900 }, name: 'Calibri' };
const STRIPE_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paleBlue } };
const TOTAL_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalBg } };
const TOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10, name: 'Calibri', color: { argb: C.navy } };
const DATE_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dateBg } };
const DATE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10, name: 'Calibri', color: { argb: C.dateFont } };

type ExcelRow = Record<string, unknown>;

const DIAS_ES: Record<string, string> = {
    Mon: 'Lunes', Tue: 'Martes', Wed: 'Miércoles',
    Thu: 'Jueves', Fri: 'Viernes', Sat: 'Sábado', Sun: 'Domingo',
};
const MESES_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatFechaLabel(fechaStr: string): string {
    const d = new Date(fechaStr + 'T00:00:00');
    const dia = DIAS_ES[d.toDateString().slice(0, 3)] ?? '';
    return `${dia} ${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatFechaCorta(fechaStr: string): string {
    const d = new Date(fechaStr + 'T00:00:00');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function applyEstadoColor(cell: ExcelJS.Cell, estado: string): void {
    if (estado === 'presente') cell.font = { ...DATA_FONT, color: { argb: C.green }, bold: true };
    if (estado === 'tardanza') cell.font = { ...DATA_FONT, color: { argb: C.amber }, bold: true };
    if (estado === 'falto') cell.font = { ...DATA_FONT, color: { argb: C.red }, bold: true };
    if (estado === 'justificado') cell.font = { ...DATA_FONT, color: { argb: C.blue }, bold: true };
}

function buildNombre(row: ExcelRow): string {
    const ap = String(row['apellido_paterno'] ?? '');
    const am = row['apellido_materno'] ? ` ${row['apellido_materno']}` : '';
    const nom = String(row['docente_nombre'] ?? '');
    return `${ap}${am}, ${nom}`;
}

function addHeaderRow(ws: ExcelJS.Worksheet, labels: string[]): void {
    const headerRow = ws.addRow(labels);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
        cell.font = HEADER_FONT;
        cell.fill = HEADER_FILL;
        cell.alignment = { vertical: 'middle', wrapText: false };
        cell.border = { bottom: { style: 'thin', color: { argb: C.darkBlue } } };
    });
}

function addDataRow(ws: ExcelJS.Worksheet, row: ExcelRow, stripeIdx: number): void {
    const estado = String(row['estado'] ?? '');
    const motivo = estado === 'justificado' ? (row['motivo_justificacion'] ?? '') : '';
    const dataRow = ws.addRow([
        buildNombre(row),
        row['grado_nombre'] ?? '',
        row['seccion_nombre'] ?? '',
        row['curso_nombre'] ?? '',
        row['hora_inicio'] ?? '',
        row['hora_fin'] ?? '',
        estado,
        row['hora_llegada'] ?? '',
        row['hora_salida'] ?? '',
        motivo,
    ]);
    dataRow.height = 18;
    dataRow.eachCell(cell => { cell.font = DATA_FONT; cell.alignment = { vertical: 'middle' }; });
    if (stripeIdx % 2 === 1) dataRow.eachCell(cell => { cell.fill = STRIPE_FILL; });
    applyEstadoColor(dataRow.getCell(7), estado);
}

const DETALLE_LABELS = [
    'Docente', 'Grado', 'Sección', 'Curso',
    'Hora inicio', 'Hora fin', 'Estado', 'Hora llegada', 'Hora salida', 'Motivo',
];
const DETALLE_WIDTHS = [28, 22, 10, 22, 12, 12, 14, 13, 13, 30];

// ── Hoja detalle — un solo día ────────────────────────────────────────────────
function buildSheetDetalle(wb: ExcelJS.Workbook, rows: ExcelRow[], fecha: string): void {
    const ws = wb.addWorksheet('Detalle del día', { properties: { tabColor: { argb: C.darkBlue } } });

    ws.mergeCells('A1:J1');
    const title = ws.getCell('A1');
    title.value = `Asistencia de Docentes — ${fecha}`;
    title.font = { bold: true, size: 13, color: { argb: C.white }, name: 'Calibri' };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;
    ws.addRow([]);

    addHeaderRow(ws, DETALLE_LABELS);
    rows.forEach((row, idx) => addDataRow(ws, row, idx));

    DETALLE_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ── Hoja detalle — rango de fechas con separador por día ─────────────────────
function buildSheetDetalleRango(wb: ExcelJS.Workbook, rows: ExcelRow[], fechaInicio: string, fechaFin: string): void {
    const ws = wb.addWorksheet('Detalle por fecha', { properties: { tabColor: { argb: C.darkBlue } } });

    const rango = fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} al ${fechaFin}`;
    ws.mergeCells('A1:J1');
    const title = ws.getCell('A1');
    title.value = `Detalle de Asistencia Docente — ${rango}`;
    title.font = { bold: true, size: 13, color: { argb: C.white }, name: 'Calibri' };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;
    ws.addRow([]);

    addHeaderRow(ws, DETALLE_LABELS);

    const porFecha = new Map<string, ExcelRow[]>();
    for (const row of rows) {
        const f = String(row['fecha'] ?? '');
        if (!porFecha.has(f)) porFecha.set(f, []);
        porFecha.get(f)!.push(row);
    }

    let stripeIdx = 0;
    for (const [fecha, rowsDelDia] of porFecha) {
        const dateRow = ws.addRow([formatFechaLabel(fecha)]);
        ws.mergeCells(`A${dateRow.number}:J${dateRow.number}`);
        dateRow.height = 18;
        dateRow.eachCell(cell => {
            cell.font = DATE_FONT;
            cell.fill = DATE_FILL;
            cell.alignment = { vertical: 'middle' };
        });
        for (const row of rowsDelDia) {
            addDataRow(ws, row, stripeIdx++);
        }
    }

    DETALLE_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ── Hoja resumen por docente ──────────────────────────────────────────────────
function buildSheetResumen(wb: ExcelJS.Workbook, rows: ExcelRow[], fechaInicio: string, fechaFin: string): void {
    const ws = wb.addWorksheet('Resumen por docente', { properties: { tabColor: { argb: C.green } } });

    const rango = fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} al ${fechaFin}`;
    ws.mergeCells('A1:G1');
    const title = ws.getCell('A1');
    title.value = `Resumen de Asistencia Docente — ${rango}`;
    title.font = { bold: true, size: 13, color: { argb: C.white }, name: 'Calibri' };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;
    ws.addRow([]);

    const headers: Record<string, string> = {
        docente_completo: 'Docente',
        presentes: 'Presentes',
        tardanzas: 'Tardanzas',
        faltos: 'Faltas',
        justificados: 'Justificados',
        sin_registro: 'Sin registro',
        porcentaje_asistencia: '% Asistencia',
    };
    const keys = Object.keys(headers);
    const numCols = ['presentes', 'tardanzas', 'faltos', 'justificados', 'sin_registro', 'porcentaje_asistencia'];

    const headerRow = ws.addRow(Object.values(headers));
    headerRow.height = 22;
    headerRow.eachCell(cell => {
        cell.font = HEADER_FONT;
        cell.fill = HEADER_FILL;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { bottom: { style: 'thin', color: { argb: C.darkBlue } } };
    });

    rows.forEach((row, idx) => {
        const values = keys.map(k => {
            if (k === 'docente_completo') return buildNombre(row);
            if (k === 'porcentaje_asistencia') {
                const v = row[k];
                return v !== null && v !== undefined ? Number(v) : null;
            }
            return row[k] ?? '';
        });
        const dataRow = ws.addRow(values);
        dataRow.height = 18;
        dataRow.eachCell((cell, colNum) => {
            cell.font = DATA_FONT;
            cell.alignment = { vertical: 'middle', horizontal: numCols.includes(keys[colNum - 1]) ? 'center' : 'left' };
        });
        if (idx % 2 === 1) dataRow.eachCell(cell => { cell.fill = STRIPE_FILL; });

        const pctCell = dataRow.getCell(keys.indexOf('porcentaje_asistencia') + 1);
        const pct = Number(row['porcentaje_asistencia'] ?? 100);
        if (Number.isFinite(pct)) {
            pctCell.numFmt = '0.00"%"';
            if (pct >= 90) pctCell.font = { ...DATA_FONT, color: { argb: C.green }, bold: true };
            else if (pct >= 75) pctCell.font = { ...DATA_FONT, color: { argb: C.amber }, bold: true };
            else pctCell.font = { ...DATA_FONT, color: { argb: C.red }, bold: true };
        }
    });

    if (rows.length > 0) {
        const sum = (key: string) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
        const avgPct = rows.reduce((acc, r) => acc + (Number(r['porcentaje_asistencia']) || 0), 0) / rows.length;
        const totalRow = ws.addRow([
            `TOTAL — ${rows.length} docentes`,
            sum('presentes'), sum('tardanzas'), sum('faltos'),
            sum('justificados'), sum('sin_registro'),
            Math.round(avgPct * 100) / 100,
        ]);
        totalRow.height = 20;
        totalRow.eachCell((cell, colNum) => {
            cell.font = TOTAL_FONT;
            cell.fill = TOTAL_FILL;
            cell.border = { top: { style: 'medium', color: { argb: C.navy } } };
            cell.alignment = { vertical: 'middle', horizontal: numCols.includes(keys[colNum - 1]) ? 'center' : 'left' };
        });
        totalRow.getCell(keys.indexOf('porcentaje_asistencia') + 1).numFmt = '0.00"%"';
    }

    const colWidths: Record<string, number> = {
        docente_completo: 32, presentes: 12, tardanzas: 12,
        faltos: 10, justificados: 14, sin_registro: 14, porcentaje_asistencia: 14,
    };
    keys.forEach((k, i) => { ws.getColumn(i + 1).width = colWidths[k] ?? 14; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ── Hoja Matriz: docentes × días, celdas P/T/F/J ────────────────────────────
// Solo se incluye en el endpoint /resumen (rango), nunca en /diario
function buildSheetMatriz(wb: ExcelJS.Workbook, rows: ExcelRow[], fechaInicio: string, fechaFin: string): void {
    const ws = wb.addWorksheet('Matriz', { properties: { tabColor: { argb: C.teal } } });

    // Recopilar fechas únicas en orden
    const fechasSet = new Set<string>();
    for (const r of rows) if (r['fecha']) fechasSet.add(String(r['fecha']));
    const fechas = [...fechasSet].sort();

    // Recopilar docentes únicos (uno por nombre completo)
    const docentesMap = new Map<string, string>(); // docente_id → nombre completo
    for (const r of rows) {
        const id = String(r['docente_id'] ?? '');
        if (!docentesMap.has(id)) docentesMap.set(id, buildNombre(r));
    }

    // Pivot: docente_id → fecha → estado dominante del día
    // (si hay varias filas del mismo docente en el mismo día, priorizamos: falto > tardanza > justificado > presente)
    const prioridad: Record<string, number> = { falto: 4, justificado: 3, tardanza: 2, presente: 1, 'sin-registro': 0 };
    const pivot = new Map<string, Map<string, string>>();
    for (const r of rows) {
        const did = String(r['docente_id'] ?? '');
        const fecha = String(r['fecha'] ?? '');
        const estado = String(r['estado'] ?? 'sin-registro');
        if (!pivot.has(did)) pivot.set(did, new Map());
        const actual = pivot.get(did)!.get(fecha) ?? 'sin-registro';
        if ((prioridad[estado] ?? 0) > (prioridad[actual] ?? 0)) {
            pivot.get(did)!.set(fecha, estado);
        }
    }

    // ── Título ────────────────────────────────────────────────────────────
    const totalCols = 1 + fechas.length + 1; // Docente + días + Resumen
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    const rango = fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} al ${fechaFin}`;
    titleCell.value = `Matriz de Asistencia Docente — ${rango}`;
    titleCell.font = { bold: true, size: 13, color: { argb: C.white }, name: 'Calibri' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // ── Leyenda ───────────────────────────────────────────────────────────
    ws.addRow([]);
    const leyendaRow = ws.addRow(['Leyenda:', 'P = Presente', 'T = Tardanza', 'F = Falta', 'J = Justificado', '— = Sin registro']);
    leyendaRow.height = 16;
    leyendaRow.getCell(1).font = { bold: true, size: 9, name: 'Calibri', color: { argb: C.navy } };
    leyendaRow.getCell(2).font = { size: 9, color: { argb: C.green }, name: 'Calibri' };
    leyendaRow.getCell(3).font = { size: 9, color: { argb: C.amber }, name: 'Calibri' };
    leyendaRow.getCell(4).font = { size: 9, color: { argb: C.red }, name: 'Calibri' };
    leyendaRow.getCell(5).font = { size: 9, color: { argb: C.blue }, name: 'Calibri' };
    leyendaRow.getCell(6).font = { size: 9, name: 'Calibri', color: { argb: C.gray900 } };

    // ── Cabecera ──────────────────────────────────────────────────────────
    const headerVals = ['Docente', ...fechas.map(f => formatFechaCorta(f)), '% Asist.'];
    const headerRow = ws.addRow(headerVals);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
        cell.font = HEADER_FONT;
        cell.fill = HEADER_FILL;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
        cell.border = { bottom: { style: 'thin', color: { argb: C.darkBlue } } };
    });
    headerRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

    // ── Filas de docentes ─────────────────────────────────────────────────
    let rowIdx = 0;
    for (const [did, nombre] of docentesMap) {
        const estadosPorFecha = pivot.get(did) ?? new Map<string, string>();

        let presentes = 0, tardanzas = 0, faltos = 0, justificados = 0, total = 0;
        const celdas: Array<{ valor: string; estado: string }> = [];

        for (const f of fechas) {
            const est = estadosPorFecha.get(f) ?? 'sin-registro';
            let letra = '—';
            if (est === 'presente') { letra = 'P'; presentes++; total++; }
            else if (est === 'tardanza') { letra = 'T'; tardanzas++; total++; }
            else if (est === 'falto') { letra = 'F'; faltos++; total++; }
            else if (est === 'justificado') { letra = 'J'; justificados++; total++; }
            celdas.push({ valor: letra, estado: est });
        }

        const pct = total > 0 ? Math.round(100 * (presentes + tardanzas) / total) : null;

        const dataRow = ws.addRow([nombre, ...celdas.map(c => c.valor), pct !== null ? `${pct}%` : '—']);
        dataRow.height = 18;
        dataRow.getCell(1).font = DATA_FONT;
        dataRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        if (rowIdx % 2 === 1) dataRow.getCell(1).fill = STRIPE_FILL;

        // Colorear celdas de días
        celdas.forEach((c, i) => {
            const cell = dataRow.getCell(i + 2);
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (c.estado === 'presente') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.matrizP } };
                cell.font = { ...DATA_FONT, color: { argb: C.green }, bold: true };
            } else if (c.estado === 'tardanza') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.matrizT } };
                cell.font = { ...DATA_FONT, color: { argb: C.amber }, bold: true };
            } else if (c.estado === 'falto') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.matrizF } };
                cell.font = { ...DATA_FONT, color: { argb: C.red }, bold: true };
            } else if (c.estado === 'justificado') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.matrizJ } };
                cell.font = { ...DATA_FONT, color: { argb: C.blue }, bold: true };
            } else {
                cell.font = { ...DATA_FONT, color: { argb: 'A0AEC0' } };
                if (rowIdx % 2 === 1) cell.fill = STRIPE_FILL;
            }
        });

        // Celda % Asistencia
        const pctCell = dataRow.getCell(fechas.length + 2);
        pctCell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (pct !== null) {
            if (pct >= 90) pctCell.font = { ...DATA_FONT, color: { argb: C.green }, bold: true };
            else if (pct >= 75) pctCell.font = { ...DATA_FONT, color: { argb: C.amber }, bold: true };
            else pctCell.font = { ...DATA_FONT, color: { argb: C.red }, bold: true };
        } else {
            pctCell.font = { ...DATA_FONT, color: { argb: 'A0AEC0' } };
        }

        rowIdx++;
    }

    // ── Anchos de columna ─────────────────────────────────────────────────
    ws.getColumn(1).width = 32;
    for (let i = 2; i <= fechas.length + 1; i++) ws.getColumn(i).width = 7;
    ws.getColumn(fechas.length + 2).width = 10;
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('reports/docentes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('auxiliar', 'admin')
export class TeacherAttendanceController {
    constructor(private readonly svc: TeacherAttendanceService) { }

    @Get('diario')
    async diario(
        @CurrentUser() user: AuthUser,
        @Query() q: ReporteDiarioDocenteQueryDto,
        @Res() res: Response,
    ) {
        const rows = await this.svc.getReporteDiario(user, q.fecha);
        if (q.format !== 'xlsx') {
            res.json({ success: true, data: rows });
            return;
        }
        const resumen = await this.svc.getResumenRango(user, q.fecha, q.fecha);
        const wb = new ExcelJS.Workbook();
        wb.creator = 'EduAula';
        wb.created = new Date();
        buildSheetDetalle(wb, rows as unknown as ExcelRow[], q.fecha);
        buildSheetResumen(wb, resumen as unknown as ExcelRow[], q.fecha, q.fecha);
        await this.sendXlsx(res, wb, `asist_docentes_${q.fecha}`);
    }

    @Get('resumen')
    async resumen(
        @CurrentUser() user: AuthUser,
        @Query() q: ReporteRangoDocenteQueryDto,
        @Res() res: Response,
    ) {
        const rows = await this.svc.getResumenRango(user, q.fecha_inicio, q.fecha_fin);
        if (q.format !== 'xlsx') {
            res.json({ success: true, data: rows });
            return;
        }
        const detalle = await this.svc.getReporteRango(user, q.fecha_inicio, q.fecha_fin);
        const wb = new ExcelJS.Workbook();
        wb.creator = 'EduAula';
        wb.created = new Date();
        buildSheetDetalleRango(wb, detalle as unknown as ExcelRow[], q.fecha_inicio, q.fecha_fin);
        buildSheetResumen(wb, rows as unknown as ExcelRow[], q.fecha_inicio, q.fecha_fin);
        buildSheetMatriz(wb, detalle as unknown as ExcelRow[], q.fecha_inicio, q.fecha_fin);
        await this.sendXlsx(res, wb, `asist_docentes_${q.fecha_inicio}_${q.fecha_fin}`);
    }

    @Get('alertas')
    alertas(
        @CurrentUser() user: AuthUser,
        @Query() q: AlertasAusenciaDocenteQueryDto,
    ) {
        return this.svc.getAlertas(user, q.fecha_inicio, q.fecha_fin, q.limit);
    }

    private async sendXlsx(res: Response, wb: ExcelJS.Workbook, baseName: string): Promise<void> {
        const buf = await workbookToBuffer(wb);
        const filename = buildFilename(baseName);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buf);
    }
}