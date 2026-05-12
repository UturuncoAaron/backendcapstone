import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

// ─── Paleta de colores ──────────────────────────────────────────────────────
const C = {
  navy:      '1E3A5F',
  darkBlue:  '1E3A8A',
  blue:      '2563EB',
  lightBlue: 'DBEAFE',
  paleBlue:  'EFF6FF',
  green:     '166534',
  lightGreen:'DCFCE7',
  amber:     '92400E',
  lightAmber:'FEF3C7',
  red:       '991B1B',
  lightRed:  'FEF2F2',
  gray50:    'F8FAFC',
  gray100:   'F1F5F9',
  gray200:   'E2E8F0',
  gray500:   '64748B',
  gray700:   '334155',
  gray900:   '0F172A',
  white:     'FFFFFF',
};

const HEADER_FILL: ExcelJS.FillPattern = { type:'pattern', pattern:'solid', fgColor:{argb:C.navy} };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold:true, color:{argb:C.white}, size:11, name:'Calibri' };
const HEADER_BORDER: Partial<ExcelJS.Borders> = {
  bottom:{ style:'thin', color:{argb:C.gray200} },
};
const CELL_BORDER: Partial<ExcelJS.Borders> = {
  bottom:{ style:'hair', color:{argb:C.gray200} },
};
const TITLE_FONT: Partial<ExcelJS.Font> = { bold:true, size:14, color:{argb:C.darkBlue}, name:'Calibri' };
const SUB_FONT: Partial<ExcelJS.Font> = { size:10, color:{argb:C.gray500}, name:'Calibri' };
const LABEL_FONT: Partial<ExcelJS.Font> = { bold:true, size:10, color:{argb:C.gray500}, name:'Calibri' };
const VALUE_FONT: Partial<ExcelJS.Font> = { size:11, color:{argb:C.gray900}, name:'Calibri' };
const SECTION_FILL: ExcelJS.FillPattern = { type:'pattern', pattern:'solid', fgColor:{argb:C.darkBlue} };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold:true, size:12, color:{argb:C.white}, name:'Calibri' };
const STRIPE_FILL: ExcelJS.FillPattern = { type:'pattern', pattern:'solid', fgColor:{argb:C.paleBlue} };

@Injectable()
export class AlumnoReportXlsxBuilder {

  async build(data: any): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduAula';
    wb.created = new Date();

    this.sheetGeneral(wb, data);
    this.sheetAcademico(wb, data);
    this.sheetAsistencia(wb, data);
    this.sheetComplementario(wb, data);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOJA 1 — GENERAL (datos personales + métricas + apoderados + matrículas)
  // ═══════════════════════════════════════════════════════════════════════════
  private sheetGeneral(wb: ExcelJS.Workbook, d: any) {
    const ws = wb.addWorksheet('General', { properties:{tabColor:{argb:C.darkBlue}} });
    ws.columns = [{width:22},{width:30},{width:22},{width:22},{width:18},{width:18}];
    let r = 1;

    // ── Título ──
    ws.mergeCells(r,1,r,6);
    const tCell = ws.getCell(r,1);
    tCell.value = 'Reporte General del Alumno';
    tCell.font = { bold:true, size:18, color:{argb:C.darkBlue}, name:'Calibri' };
    r++;
    ws.mergeCells(r,1,r,6);
    const p = d.personal;
    ws.getCell(r,1).value = `${p.apellido_paterno} ${p.apellido_materno||''} ${p.nombre}`.trim();
    ws.getCell(r,1).font = { bold:true, size:14, color:{argb:C.gray900}, name:'Calibri' };
    r++;
    ws.mergeCells(r,1,r,6);
    ws.getCell(r,1).value = `Generado: ${fmtDT(d.generado_en)}  •  ${d.anio_filtro ? 'Año '+d.anio_filtro : 'Histórico completo'}`;
    ws.getCell(r,1).font = SUB_FONT;
    r += 2;

    // ── Datos personales ──
    r = this.sectionHeader(ws, r, 'DATOS PERSONALES', 6);
    const fields: [string,any][] = [
      ['Código estudiante', p.codigo_estudiante||'—'],
      ['Documento', `${p.tipo_documento||'Doc.'} ${p.numero_documento||'—'}`],
      ['Estado', p.activo?'Activo':'Inactivo'],
      ['Inclusivo', p.inclusivo?'Sí':'No'],
      ['Fecha de nacimiento', p.fecha_nacimiento ? fmtDate(p.fecha_nacimiento) : '—'],
      ['Teléfono', p.telefono||'—'],
      ['Email', p.email||'—'],
      ['Año de ingreso', p.anio_ingreso??'—'],
    ];
    for (const [label,val] of fields) {
      ws.getCell(r,1).value = label; ws.getCell(r,1).font = LABEL_FONT;
      ws.getCell(r,2).value = val;   ws.getCell(r,2).font = VALUE_FONT;
      if (label==='Estado') {
        ws.getCell(r,2).font = { ...VALUE_FONT, color:{argb: p.activo?C.green:C.red}, bold:true };
      }
      if (label==='Inclusivo' && p.inclusivo) {
        ws.getCell(r,2).font = { ...VALUE_FONT, color:{argb:C.amber}, bold:true };
      }
      r++;
    }
    r++;

    // ── Apoderados ──
    r = this.sectionHeader(ws, r, 'APODERADOS VINCULADOS', 6);
    if (d.padres?.length) {
      r = this.tableHeader(ws, r, ['Nombre','Relación','Documento','Teléfono','Email']);
      for (let i=0; i<d.padres.length; i++) {
        const pa = d.padres[i];
        const vals = [
          `${pa.apellido_paterno} ${pa.apellido_materno||''}, ${pa.nombre}`.trim(),
          pa.relacion||'—',
          `${pa.tipo_documento||'Doc.'} ${pa.numero_documento||'—'}`,
          pa.telefono||'—',
          pa.email||'—',
        ];
        r = this.tableRow(ws, r, vals, i%2===1);
      }
    } else {
      ws.getCell(r,1).value = 'No hay apoderados vinculados.';
      ws.getCell(r,1).font = { ...SUB_FONT, italic:true }; r++;
    }
    r++;

    // ── Matrículas ──
    r = this.sectionHeader(ws, r, 'HISTORIAL DE MATRÍCULAS', 6);
    if (d.matriculas?.length) {
      r = this.tableHeader(ws, r, ['Año','Periodo','Grado / Sección','Tutor','Fecha','Estado']);
      for (let i=0; i<d.matriculas.length; i++) {
        const m = d.matriculas[i];
        const vals = [
          m.periodo_anio,
          `${m.periodo_nombre} (Bim. ${m.periodo_bimestre})`,
          `${m.grado} — Sección ${m.seccion}`,
          m.tutor_nombre ? `${m.tutor_apellido_paterno} ${m.tutor_apellido_materno||''}, ${m.tutor_nombre}`.trim() : '—',
          fmtDate(m.fecha_matricula),
          m.activo?'Activa':'Histórica',
        ];
        const row = this.tableRow(ws, r, vals, i%2===1);
        if (m.activo) {
          ws.getCell(r,6).font = { ...VALUE_FONT, color:{argb:C.green}, bold:true };
        }
        r = row;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOJA 2 — ACADÉMICO (resumen + por curso + detalle evaluaciones)
  // ═══════════════════════════════════════════════════════════════════════════
  private sheetAcademico(wb: ExcelJS.Workbook, d: any) {
    const ws = wb.addWorksheet('Académico', { properties:{tabColor:{argb:C.blue}} });
    ws.columns = [{width:16},{width:28},{width:24},{width:18},{width:14},{width:14},{width:30}];
    let r = 1;

    ws.mergeCells(r,1,r,7);
    ws.getCell(r,1).value = 'Rendimiento Académico';
    ws.getCell(r,1).font = TITLE_FONT; r+=2;

    // ── Resumen por bimestre ──
    r = this.sectionHeader(ws, r, 'RESUMEN POR BIMESTRE', 7);
    const bims = d.notas?.por_bimestre ?? [];
    if (bims.length) {
      r = this.tableHeader(ws, r, ['Año','Bimestre','Cursos evaluados','Promedio']);
      for (let i=0; i<bims.length; i++) {
        const n = bims[i];
        r = this.tableRow(ws, r, [n.anio, `${n.periodo_nombre} (Bim. ${n.bimestre})`, n.cursos, numFmt(n.promedio_general)], i%2===1);
      }
    } else { ws.getCell(r,1).value='Sin notas registradas.'; ws.getCell(r,1).font={...SUB_FONT,italic:true}; r++; }
    r++;

    // ── Promedios por curso ──
    r = this.sectionHeader(ws, r, 'PROMEDIOS POR CURSO', 7);
    const cursos = d.notas?.por_curso_bimestre ?? [];
    if (cursos.length) {
      r = this.tableHeader(ws, r, ['Periodo','Año','Bimestre','Curso','Evaluaciones','Promedio']);
      for (let i=0; i<cursos.length; i++) {
        const c = cursos[i];
        r = this.tableRow(ws, r, [c.periodo_nombre, c.anio, c.bimestre, c.curso, c.cantidad, numFmt(c.promedio)], i%2===1);
      }
    } else { ws.getCell(r,1).value='Sin promedios por curso.'; ws.getCell(r,1).font={...SUB_FONT,italic:true}; r++; }
    r++;

    // ── Detalle evaluaciones ──
    r = this.sectionHeader(ws, r, 'DETALLE DE EVALUACIONES', 7);
    const det = d.notas?.detalle ?? [];
    if (det.length) {
      r = this.tableHeader(ws, r, ['Fecha','Periodo','Curso','Evaluación','Tipo','Nota','Observaciones']);
      for (let i=0; i<det.length; i++) {
        const n = det[i];
        r = this.tableRow(ws, r, [
          n.fecha?fmtDate(n.fecha):'—',
          `${n.periodo_nombre} (${n.anio})`,
          n.curso, n.titulo, n.tipo, numFmt(n.nota), n.observaciones||'—',
        ], i%2===1);
      }
    } else { ws.getCell(r,1).value='Sin evaluaciones detalladas.'; ws.getCell(r,1).font={...SUB_FONT,italic:true}; r++; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOJA 3 — ASISTENCIA (totales + por bimestre + detalle diario)
  // ═══════════════════════════════════════════════════════════════════════════
  private sheetAsistencia(wb: ExcelJS.Workbook, d: any) {
    const ws = wb.addWorksheet('Asistencia', { properties:{tabColor:{argb:C.green}} });
    ws.columns = [{width:18},{width:26},{width:20},{width:14},{width:14},{width:14},{width:14}];
    let r = 1;

    ws.mergeCells(r,1,r,7);
    ws.getCell(r,1).value = 'Registro de Asistencia';
    ws.getCell(r,1).font = TITLE_FONT; r+=2;

    // ── Resumen total ──
    r = this.sectionHeader(ws, r, 'RESUMEN GENERAL', 7);
    const t = d.asistencia?.total ?? {};
    const pct = d.asistencia?.porcentaje_asistencia;
    const summary: [string,any][] = [
      ['Total registros', t.total??0],
      ['Asistió', t.asistio??0],
      ['Tardanza', t.tardanza??0],
      ['Justificado', t.justificado??0],
      ['Falta', t.falta??0],
      ['% Asistencia', pct!==null&&pct!==undefined ? `${pct}%` : '—'],
    ];
    for (const [l,v] of summary) {
      ws.getCell(r,1).value=l; ws.getCell(r,1).font=LABEL_FONT;
      ws.getCell(r,2).value=v; ws.getCell(r,2).font=VALUE_FONT;
      r++;
    }
    r++;

    // ── Por bimestre ──
    r = this.sectionHeader(ws, r, 'POR BIMESTRE', 7);
    const bims = d.asistencia?.por_bimestre ?? [];
    if (bims.length) {
      r = this.tableHeader(ws, r, ['Periodo','Año','Bimestre','Total','Asistió','Tardanza','Falta']);
      for (let i=0; i<bims.length; i++) {
        const a = bims[i];
        r = this.tableRow(ws, r, [a.periodo_nombre, a.anio, a.bimestre, a.total, a.asistio, a.tardanza, a.falta], i%2===1);
      }
    } else { ws.getCell(r,1).value='Sin asistencia registrada.'; ws.getCell(r,1).font={...SUB_FONT,italic:true}; r++; }
    r++;

    // ── Detalle diario ──
    r = this.sectionHeader(ws, r, 'DETALLE DIARIO', 7);
    const det = d.asistencia?.detalle ?? [];
    if (det.length) {
      r = this.tableHeader(ws, r, ['Fecha','Periodo','Grado / Sección','Estado','Observación']);
      for (let i=0; i<det.length; i++) {
        const a = det[i];
        const estadoColor = a.estado==='asistio'?C.green : a.estado==='falta'?C.red : a.estado==='tardanza'?C.amber : C.gray700;
        const row = this.tableRow(ws, r, [
          fmtDate(a.fecha),
          `${a.periodo_nombre} (${a.periodo_anio})`,
          `${a.grado||'—'} ${a.seccion?'— '+a.seccion:''}`.trim(),
          capitalize(a.estado),
          a.observacion||'—',
        ], i%2===1);
        ws.getCell(r,4).font = { ...VALUE_FONT, color:{argb:estadoColor}, bold:true };
        r = row;
      }
    } else { ws.getCell(r,1).value='Sin detalle de asistencia.'; ws.getCell(r,1).font={...SUB_FONT,italic:true}; r++; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOJA 4 — COMPLEMENTARIO (libretas + psicología + citas)
  // ═══════════════════════════════════════════════════════════════════════════
  private sheetComplementario(wb: ExcelJS.Workbook, d: any) {
    const ws = wb.addWorksheet('Complementario', { properties:{tabColor:{argb:C.amber}} });
    ws.columns = [{width:20},{width:24},{width:20},{width:20},{width:18},{width:30}];
    let r = 1;

    ws.mergeCells(r,1,r,6);
    ws.getCell(r,1).value = 'Información Complementaria';
    ws.getCell(r,1).font = TITLE_FONT; r+=2;

    // ── Libretas ──
    r = this.sectionHeader(ws, r, 'LIBRETAS', 6);
    const libs = d.libretas ?? [];
    if (libs.length) {
      r = this.tableHeader(ws, r, ['Periodo','Año','Bimestre','Tipo','Archivo','Observaciones']);
      for (let i=0; i<libs.length; i++) {
        const l = libs[i];
        r = this.tableRow(ws, r, [l.periodo_nombre, l.periodo_anio, l.periodo_bimestre, capitalize(l.tipo), l.nombre_archivo||'—', l.observaciones||'—'], i%2===1);
      }
    } else { ws.getCell(r,1).value='Sin libretas registradas.'; ws.getCell(r,1).font={...SUB_FONT,italic:true}; r++; }
    r++;

    // ── Psicología ──
    r = this.sectionHeader(ws, r, 'PSICOLOGÍA', 6);
    const psi = d.psicologia ?? {};
    const psiFields: [string,any][] = [
      ['Asignaciones', psi.asignaciones??0],
      ['Fichas', psi.fichas??0],
      ['Última ficha', psi.ultima_ficha ? fmtDate(psi.ultima_ficha) : '—'],
    ];
    for (const [l,v] of psiFields) {
      ws.getCell(r,1).value=l; ws.getCell(r,1).font=LABEL_FONT;
      ws.getCell(r,2).value=v; ws.getCell(r,2).font=VALUE_FONT; r++;
    }
    const cats = psi.categorias ?? [];
    if (cats.length) {
      r++;
      r = this.tableHeader(ws, r, ['Categoría','Cantidad']);
      for (let i=0; i<cats.length; i++) {
        r = this.tableRow(ws, r, [cats[i].categoria, cats[i].cantidad], i%2===1);
      }
    }
    r++;

    // ── Citas resumen ──
    r = this.sectionHeader(ws, r, 'CITAS', 6);
    const citas = d.citas ?? {};
    const citaFields: [string,any][] = [
      ['Total', citas.total??0],
      ['Pendientes', citas.pendientes??0],
      ['Confirmadas', citas.confirmadas??0],
      ['Realizadas', citas.realizadas??0],
      ['Canceladas', citas.canceladas??0],
    ];
    for (const [l,v] of citaFields) {
      ws.getCell(r,1).value=l; ws.getCell(r,1).font=LABEL_FONT;
      ws.getCell(r,2).value=v; ws.getCell(r,2).font=VALUE_FONT; r++;
    }
    r++;

    // ── Últimas citas ──
    const ultimas = citas.ultimas ?? [];
    if (ultimas.length) {
      r = this.sectionHeader(ws, r, 'ÚLTIMAS CITAS', 6);
      r = this.tableHeader(ws, r, ['Fecha','Tipo','Modalidad','Estado','Motivo','Notas']);
      for (let i=0; i<ultimas.length; i++) {
        const c = ultimas[i];
        const estadoColor = c.estado==='realizada'?C.green : c.estado==='cancelada'?C.red : c.estado==='pendiente'?C.amber : C.blue;
        const row = this.tableRow(ws, r, [
          fmtDT(c.fecha_hora), capitalize(c.tipo), capitalize(c.modalidad),
          capitalize(c.estado), c.motivo, c.notas_posteriores||c.notas_previas||'—',
        ], i%2===1);
        ws.getCell(r,4).font = { ...VALUE_FONT, color:{argb:estadoColor}, bold:true };
        r = row;
      }
    }
  }

  // ─── Helpers reutilizables ────────────────────────────────────────────────

  private sectionHeader(ws: ExcelJS.Worksheet, r: number, title: string, cols: number): number {
    ws.mergeCells(r, 1, r, cols);
    const cell = ws.getCell(r, 1);
    cell.value = title;
    cell.font = SECTION_FONT;
    cell.fill = SECTION_FILL;
    cell.alignment = { vertical:'middle', horizontal:'left' };
    ws.getRow(r).height = 26;
    return r + 1;
  }

  private tableHeader(ws: ExcelJS.Worksheet, r: number, headers: string[]): number {
    for (let i = 0; i < headers.length; i++) {
      const cell = ws.getCell(r, i+1);
      cell.value = headers[i];
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.border = HEADER_BORDER;
      cell.alignment = { vertical:'middle' };
    }
    ws.getRow(r).height = 22;
    return r + 1;
  }

  private tableRow(ws: ExcelJS.Worksheet, r: number, values: any[], stripe: boolean): number {
    for (let i = 0; i < values.length; i++) {
      const cell = ws.getCell(r, i+1);
      cell.value = values[i];
      cell.font = VALUE_FONT;
      cell.border = CELL_BORDER;
      if (stripe) cell.fill = STRIPE_FILL;
    }
    return r + 1;
  }
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function fmtDate(v: string|null|undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtDT(v: string|null|undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${fmtDate(v)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function numFmt(v: any): number|string {
  if (v===null||v===undefined) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n*100)/100 : '—';
}

function capitalize(s: string|null|undefined): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
