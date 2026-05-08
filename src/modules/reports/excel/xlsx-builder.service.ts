import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

/**
 * XlsxBuilderService
 *
 * Construye el workbook XLSX del reporte de sección con 4 hojas que
 * mantienen paridad 1:1 con los sub-tabs del frontend:
 *   1. Ranking
 *   2. Notas por curso
 *   3. Asistencia
 *   4. Tareas
 *
 * No depende de Excel, OS de escritorio ni Java — usa la librería xlsx
 * (SheetJS) en memoria. Devuelve un Buffer listo para enviar al cliente.
 *
 * Si en el futuro hace falta otro reporte (asistencia docentes, etc.)
 * agrega un nuevo método público acá. Mantiene toda la lógica de
 * presentación de Excel concentrada en un único archivo.
 */
@Injectable()
export class XlsxBuilderService {
  /**
   * Genera el libro XLSX completo del reporte por sección.
   *
   * @param data Respuesta cruda de SectionReportService.getResumen()
   * @returns    Buffer con el workbook serializado en formato xlsx
   */
  buildSeccionResumenXlsx(data: SeccionResumenResponseLike): Buffer {
    const wb = XLSX.utils.book_new();

    this.appendRankingSheet(wb, data);
    this.appendNotasSheet(wb, data);
    this.appendAsistenciaSheet(wb, data);
    this.appendTareasSheet(wb, data);

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ─── Hoja 1: Ranking ──────────────────────────────────────────────────────

  private appendRankingSheet(
    wb: XLSX.WorkBook,
    data: SeccionResumenResponseLike,
  ): void {
    const rows = (data.ranking ?? []).map((a, i) => ({
      '#': i + 1,
      'Apellido paterno': a.apellido_paterno ?? '',
      'Apellido materno': a.apellido_materno ?? '',
      Nombre: a.nombre ?? '',
      DNI: a.dni ?? '',
      Promedio: numberOrEmpty(a.promedio_general),
      'Cursos en riesgo': a.cursos_en_riesgo ?? 0,
      Categoría: prettyCategoria(a.categoria),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    autoSizeColumns(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Ranking');
  }

  // ─── Hoja 2: Notas por curso ──────────────────────────────────────────────

  private appendNotasSheet(
    wb: XLSX.WorkBook,
    data: SeccionResumenResponseLike,
  ): void {
    const rows = (data.notas_por_curso ?? []).map((n) => ({
      'Apellido paterno': n.apellido_paterno ?? '',
      'Apellido materno': n.apellido_materno ?? '',
      Nombre: n.nombre ?? '',
      DNI: n.dni ?? '',
      Curso: n.curso ?? '',
      'Total notas': n.total_notas ?? 0,
      Promedio: numberOrEmpty(n.promedio),
      Escala: n.escala ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    autoSizeColumns(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Notas por curso');
  }

  // ─── Hoja 3: Asistencia ───────────────────────────────────────────────────

  private appendAsistenciaSheet(
    wb: XLSX.WorkBook,
    data: SeccionResumenResponseLike,
  ): void {
    const rows = (data.resumen_asistencia ?? []).map((a) => ({
      'Apellido paterno': a.apellido_paterno ?? '',
      'Apellido materno': a.apellido_materno ?? '',
      Nombre: a.nombre ?? '',
      DNI: a.dni ?? '',
      'Días registrados': a.dias_registrados ?? 0,
      Asistencias: a.asistencias ?? 0,
      Tardanzas: a.tardanzas ?? 0,
      Faltas: a.faltas ?? 0,
      '% Asistencia': numberOrEmpty(a.porcentaje_asistencia),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    autoSizeColumns(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
  }

  // ─── Hoja 4: Tareas ───────────────────────────────────────────────────────

  private appendTareasSheet(
    wb: XLSX.WorkBook,
    data: SeccionResumenResponseLike,
  ): void {
    const rows = (data.entregas_por_tarea ?? []).map((t) => ({
      Tarea: t.titulo ?? '',
      'Fecha límite': formatDate(t.fecha_limite),
      Entregaron: t.entregaron ?? 0,
      Pendientes: t.pendientes ?? 0,
      'Con retraso': t.con_retraso ?? 0,
      Promedio: numberOrEmpty(t.promedio_calificacion),
      '% Entrega': numberOrEmpty(t.porcentaje_entrega),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    autoSizeColumns(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Tareas');
  }
}

// ─── Tipado mínimo (estructural) ──────────────────────────────────────────────
// Evita un import circular: aceptamos cualquier objeto con la forma esperada.
// El controller pasa el resultado de SectionReportService.getResumen() y los
// campos coinciden 1:1 con SeccionResumenResponse del frontend.

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

// ─── Utilidades locales ───────────────────────────────────────────────────────

function numberOrEmpty(v: number | string | null | undefined): number | string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : '';
}

function formatDate(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function prettyCategoria(c: string | undefined): string {
  switch (c) {
    case 'top':
      return 'Top';
    case 'normal':
      return 'Normal';
    case 'riesgo':
      return 'Riesgo';
    case 'sin-datos':
      return 'Sin datos';
    default:
      return c ?? '';
  }
}

/**
 * Auto-ajusta el ancho de cada columna en función del contenido más largo.
 * Tope a 60 chars para evitar columnas absurdamente anchas.
 */
function autoSizeColumns(
  ws: XLSX.WorkSheet,
  rows: Record<string, unknown>[],
): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => {
    const maxBody = rows.reduce((max, r) => {
      const s = String(r[h] ?? '');
      return Math.max(max, s.length);
    }, 0);
    const w = Math.max(h.length, maxBody) + 2;
    return { wch: Math.min(w, 60) };
  });
  ws['!cols'] = widths;
}
