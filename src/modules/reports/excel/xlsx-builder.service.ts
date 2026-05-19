// src/modules/reports/excel/xlsx-builder.service.ts
import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

// ── Paleta de colores (misma que AlumnoReportXlsxBuilder) ─────────────────────
const C = {
  navy: '1E3A5F',
  darkBlue: '1E3A8A',
  blue: '2563EB',
  paleBlue: 'EFF6FF',
  green: '166534',
  lightGreen: 'DCFCE7',
  amber: '92400E',
  red: '991B1B',
  gray200: 'E2E8F0',
  gray500: '64748B',
  gray900: '0F172A',
  white: 'FFFFFF',
};

const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: C.white }, size: 11, name: 'Calibri' };
const VALUE_FONT: Partial<ExcelJS.Font> = { size: 10, color: { argb: C.gray900 }, name: 'Calibri' };
const STRIPE_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paleBlue } };
const SECTION_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.darkBlue } };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, size: 12, color: { argb: C.white }, name: 'Calibri' };

@Injectable()
export class XlsxBuilderService {

  async buildSeccionResumenXlsx(data: SeccionResumenResponseLike): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduAula';
    wb.created = new Date();

    this.sheetRanking(wb, data);
    this.sheetNotas(wb, data);
    this.sheetAsistencia(wb, data);
    this.sheetTareas(wb, data);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ── Hoja 1: Ranking ───────────────────────────────────────────────────────

  private sheetRanking(wb: ExcelJS.Workbook, data: SeccionResumenResponseLike): void {
    const ws = wb.addWorksheet('Ranking', { properties: { tabColor: { argb: C.darkBlue } } });
    ws.columns = [
      { header: '#', width: 6 },
      { header: 'Apellido paterno', width: 22 },
      { header: 'Apellido materno', width: 22 },
      { header: 'Nombre', width: 22 },
      { header: 'DNI', width: 14 },
      { header: 'Promedio', width: 12 },
      { header: 'Cursos en riesgo', width: 16 },
      { header: 'Categoría', width: 14 },
    ];
    this.styleHeaderRow(ws);

    (data.ranking ?? []).forEach((a, i) => {
      const row = ws.addRow([
        i + 1,
        a.apellido_paterno ?? '',
        a.apellido_materno ?? '',
        a.nombre ?? '',
        a.dni ?? '',
        numFmt(a.promedio_general),
        a.cursos_en_riesgo ?? 0,
        prettyCategoria(a.categoria),
      ]);
      if (i % 2 === 1) this.stripeRow(row);

      // Color por categoría
      const catCell = row.getCell(8);
      if (a.categoria === 'riesgo') {
        catCell.font = { ...VALUE_FONT, color: { argb: C.red }, bold: true };
      } else if (a.categoria === 'top') {
        catCell.font = { ...VALUE_FONT, color: { argb: C.green }, bold: true };
      }
    });
  }

  // ── Hoja 2: Notas por curso ───────────────────────────────────────────────

  private sheetNotas(wb: ExcelJS.Workbook, data: SeccionResumenResponseLike): void {
    const ws = wb.addWorksheet('Notas por curso', { properties: { tabColor: { argb: C.blue } } });
    ws.columns = [
      { header: 'Apellido paterno', width: 22 },
      { header: 'Apellido materno', width: 22 },
      { header: 'Nombre', width: 22 },
      { header: 'DNI', width: 14 },
      { header: 'Curso', width: 28 },
      { header: 'Total notas', width: 13 },
      { header: 'Promedio', width: 12 },
      { header: 'Escala', width: 10 },
    ];
    this.styleHeaderRow(ws);

    (data.notas_por_curso ?? []).forEach((n, i) => {
      const row = ws.addRow([
        n.apellido_paterno ?? '',
        n.apellido_materno ?? '',
        n.nombre ?? '',
        n.dni ?? '',
        n.curso ?? '',
        n.total_notas ?? 0,
        numFmt(n.promedio),
        n.escala ?? '',
      ]);
      if (i % 2 === 1) this.stripeRow(row);
    });
  }

  // ── Hoja 3: Asistencia ────────────────────────────────────────────────────

  private sheetAsistencia(wb: ExcelJS.Workbook, data: SeccionResumenResponseLike): void {
    const ws = wb.addWorksheet('Asistencia', { properties: { tabColor: { argb: C.green } } });
    ws.columns = [
      { header: 'Apellido paterno', width: 22 },
      { header: 'Apellido materno', width: 22 },
      { header: 'Nombre', width: 22 },
      { header: 'DNI', width: 14 },
      { header: 'Días registrados', width: 16 },
      { header: 'Asistencias', width: 14 },
      { header: 'Tardanzas', width: 12 },
      { header: 'Faltas', width: 10 },
      { header: '% Asistencia', width: 14 },
    ];
    this.styleHeaderRow(ws);

    (data.resumen_asistencia ?? []).forEach((a, i) => {
      const row = ws.addRow([
        a.apellido_paterno ?? '',
        a.apellido_materno ?? '',
        a.nombre ?? '',
        a.dni ?? '',
        a.dias_registrados ?? 0,
        a.asistencias ?? 0,
        a.tardanzas ?? 0,
        a.faltas ?? 0,
        numFmt(a.porcentaje_asistencia),
      ]);
      if (i % 2 === 1) this.stripeRow(row);

      // Color faltas altas
      const pct = Number(a.porcentaje_asistencia ?? 100);
      if (Number.isFinite(pct) && pct < 75) {
        row.getCell(9).font = { ...VALUE_FONT, color: { argb: C.red }, bold: true };
      }
    });
  }

  // ── Hoja 4: Tareas ────────────────────────────────────────────────────────

  private sheetTareas(wb: ExcelJS.Workbook, data: SeccionResumenResponseLike): void {
    const ws = wb.addWorksheet('Tareas', { properties: { tabColor: { argb: C.amber } } });
    ws.columns = [
      { header: 'Tarea', width: 32 },
      { header: 'Fecha límite', width: 16 },
      { header: 'Entregaron', width: 13 },
      { header: 'Pendientes', width: 13 },
      { header: 'Con retraso', width: 13 },
      { header: 'Promedio', width: 12 },
      { header: '% Entrega', width: 12 },
    ];
    this.styleHeaderRow(ws);

    (data.entregas_por_tarea ?? []).forEach((t, i) => {
      const row = ws.addRow([
        t.titulo ?? '',
        fmtDate(t.fecha_limite),
        t.entregaron ?? 0,
        t.pendientes ?? 0,
        t.con_retraso ?? 0,
        numFmt(t.promedio_calificacion),
        numFmt(t.porcentaje_entrega),
      ]);
      if (i % 2 === 1) this.stripeRow(row);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private styleHeaderRow(ws: ExcelJS.Worksheet): void {
    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { vertical: 'middle' };
    });
  }

  private stripeRow(row: ExcelJS.Row): void {
    row.eachCell(cell => { cell.fill = STRIPE_FILL; });
  }
}

// ── Tipos (estructural, sin import circular) ──────────────────────────────────

interface AlumnoLike {
  alumno_id?: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  nombre?: string | null;
  dni?: string | null;
}

interface RankingRowLike extends AlumnoLike {
  promedio_general?: number | string | null;
  cursos_en_riesgo?: number;
  categoria?: 'top' | 'normal' | 'riesgo' | 'sin-datos' | string;
}

interface NotaCursoLike extends AlumnoLike {
  curso_id?: string;
  curso?: string;
  total_notas?: number;
  promedio?: number | string | null;
  escala?: string;
}

interface AsistenciaRowLike extends AlumnoLike {
  dias_registrados?: number;
  asistencias?: number;
  tardanzas?: number;
  faltas?: number;
  porcentaje_asistencia?: number | string | null;
}

interface TareaRowLike {
  tarea_id?: string;
  titulo?: string;
  fecha_limite?: string | Date | null;
  entregaron?: number;
  pendientes?: number;
  con_retraso?: number;
  promedio_calificacion?: number | string | null;
  porcentaje_entrega?: number | string | null;
}

export interface SeccionResumenResponseLike {
  seccion?: { grado?: string; nombre?: string; tutor_nombre?: string | null; total_matriculados?: number };
  periodo?: { id?: string; nombre?: string };
  ranking?: RankingRowLike[];
  notas_por_curso?: NotaCursoLike[];
  resumen_asistencia?: AsistenciaRowLike[];
  entregas_por_tarea?: TareaRowLike[];
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function numFmt(v: number | string | null | undefined): number | string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : '';
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function prettyCategoria(c: string | undefined): string {
  const map: Record<string, string> = {
    top: 'Top',
    normal: 'Normal',
    riesgo: 'Riesgo',
    'sin-datos': 'Sin datos',
  };
  return map[c ?? ''] ?? (c ?? '');
}