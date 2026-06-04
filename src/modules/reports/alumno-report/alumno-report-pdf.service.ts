import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

const PRIMARY = '#1E3A5F';
const DARK_BLUE = '#1E3A8A';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const STRIPE = '#F8FAFC';
const WHITE = '#FFFFFF';

const ML = 40;
const MR = 40;
const PW = 595.28;
const UW = PW - ML - MR;

// Espaciado compacto pero legible
const GAP_SECTION = 10;  // entre secciones
const GAP_INNER = 5;   // dentro de una sección
const ROW_H = 17;  // altura de fila de tabla
const FONT_SIZE = 7.5; // tamaño de texto en tablas
const CARD_H_SM = 30;  // tarjeta pequeña (datos personales)
const CARD_H_MET = 42;  // tarjeta métricas

@Injectable()
export class AlumnoReportPdfBuilder {

    async build(data: any): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 40, left: ML, right: MR },
                info: { Title: 'Reporte General del Alumno', Creator: 'EduAula' },
                autoFirstPage: true,
            });
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            this.render(doc, data);
            doc.end();
        });
    }

    private render(doc: PDFKit.PDFDocument, d: any) {
        this.renderHeader(doc, d);
        this.renderMetrics(doc, d);
        this.renderDatosPersonales(doc, d);
        this.renderApoderados(doc, d);
        this.renderMatriculas(doc, d);
        this.renderResumenAcademico(doc, d);
        this.renderPromediosPorCurso(doc, d);
        this.renderDetalleEvaluaciones(doc, d);
        this.renderAsistencia(doc, d);
        this.renderPsicologiaCitas(doc, d);
        this.renderFooter(doc);
    }

    // ═══════════════════════════════════════════════════════════════
    // ENCABEZADO
    // ═══════════════════════════════════════════════════════════════
    private renderHeader(doc: PDFKit.PDFDocument, d: any) {
        const p = d.personal;

        // Banner azul compacto
        const bannerH = 52;
        doc.rect(ML, doc.y, UW, bannerH).fill(PRIMARY);
        const by = doc.y;

        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(WHITE)
            .text('I.E. JUAN PABLO VIZCARDO Y GUZMÁN — EDUAULA', ML + 8, by + 7, { width: UW - 16 });
        doc.font('Helvetica-Bold').fontSize(12).fillColor(WHITE)
            .text('REPORTE GENERAL DEL ALUMNO', ML + 8, by + 17, { width: UW - 16 });
        const anioLabel = d.anio_filtro ? `Año ${d.anio_filtro}` : 'Histórico completo';
        doc.font('Helvetica').fontSize(7.5).fillColor('#DBEAFE')
            .text(`${anioLabel}  •  Generado: ${fmtDT(d.generado_en)}`, ML + 8, by + 34, { width: UW - 16 });

        doc.y = by + bannerH + 8;

        // Nombre del alumno
        const nombre = [p.apellido_paterno, p.apellido_materno, p.nombre].filter(Boolean).join(' ');
        doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK_BLUE)
            .text(nombre, ML, doc.y);

        doc.y += 4;

        // Tags en línea
        const tags: string[] = [
            `Código ${p.codigo_estudiante || '—'}`,
            `${p.tipo_documento || 'Doc.'} ${p.numero_documento || '—'}`,
            p.activo ? 'Activo' : 'Inactivo',
        ];
        if (p.inclusivo) tags.push('Inclusivo');

        let tx = ML;
        const tagY = doc.y;
        doc.font('Helvetica').fontSize(7.5);
        for (const tag of tags) {
            const tw = doc.widthOfString(tag) + 10;
            doc.roundedRect(tx, tagY, tw, 14, 3).fill('#EFF6FF');
            doc.fillColor(DARK_BLUE).text(tag, tx + 5, tagY + 3, { lineBreak: false });
            tx += tw + 5;
        }

        doc.y = tagY + 18;
        this.hline(doc, doc.y);
        doc.y += GAP_SECTION;
    }

    // ═══════════════════════════════════════════════════════════════
    // MÉTRICAS
    // ═══════════════════════════════════════════════════════════════
    private renderMetrics(doc: PDFKit.PDFDocument, d: any) {
        const metrics = [
            { label: 'Promedio general', value: promedioGeneral(d) },
            { label: 'Asistencia', value: d.asistencia?.porcentaje_asistencia != null ? `${d.asistencia.porcentaje_asistencia}%` : '—' },
            { label: 'Matrículas', value: String(d.matriculas?.length ?? 0) },
            { label: 'Libretas', value: String(d.libretas?.length ?? 0) },
        ];

        const cardW = UW / 4 - 3;
        let mx = ML;
        const my = doc.y;

        for (const m of metrics) {
            doc.roundedRect(mx, my, cardW, CARD_H_MET, 5).fill(STRIPE);
            doc.font('Helvetica').fontSize(7).fillColor(MUTED)
                .text(m.label, mx + 7, my + 6, { width: cardW - 14, lineBreak: false });
            doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT)
                .text(m.value, mx + 7, my + 17, { width: cardW - 14, lineBreak: false });
            mx += cardW + 4;
        }

        doc.y = my + CARD_H_MET + GAP_SECTION;
    }

    // ═══════════════════════════════════════════════════════════════
    // DATOS PERSONALES
    // ═══════════════════════════════════════════════════════════════
    private renderDatosPersonales(doc: PDFKit.PDFDocument, d: any) {
        const p = d.personal;
        this.sectionTitle(doc, 'Datos personales');

        const edad = calcEdad(p.fecha_nacimiento);
        const matriculaActual = d.matriculas?.find((m: any) => m.activo);
        const fields: [string, string][] = [
            ['Fecha de nacimiento', p.fecha_nacimiento ? fmtDate(p.fecha_nacimiento) : '—'],
            ['Edad', edad !== null ? `${edad} años` : '—'],
            ['Teléfono', p.telefono || '—'],
            ['Email', p.email || '—'],
            ['Año de ingreso', p.anio_ingreso != null ? String(p.anio_ingreso) : '—'],
            ['Matrícula actual', matriculaActual ? `${matriculaActual.grado} — Sección ${matriculaActual.seccion}` : '—'],
        ];

        const colW = UW / 3 - 3;
        let gx = ML;
        let gy = doc.y;

        for (let i = 0; i < fields.length; i++) {
            const [label, value] = fields[i];
            doc.roundedRect(gx, gy, colW, CARD_H_SM, 4).fill(STRIPE);
            doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
                .text(label, gx + 7, gy + 4, { width: colW - 14, lineBreak: false });
            doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT)
                .text(value, gx + 7, gy + 14, { width: colW - 14, lineBreak: false });

            if ((i + 1) % 3 === 0) {
                gx = ML;
                gy += CARD_H_SM + 4;
            } else {
                gx += colW + 4;
            }
        }

        doc.y = gy + CARD_H_SM + GAP_SECTION;
    }

    // ═══════════════════════════════════════════════════════════════
    // APODERADOS
    // ═══════════════════════════════════════════════════════════════
    private renderApoderados(doc: PDFKit.PDFDocument, d: any) {
        this.sectionTitle(doc, 'Apoderados vinculados');
        if (!d.padres?.length) {
            this.emptyNote(doc, 'No hay apoderados activos vinculados.');
            return;
        }
        this.table(doc,
            ['Nombre', 'Relación', 'Documento', 'Contacto'],
            [175, 80, 100, 160],
            d.padres.map((pa: any) => [
                `${pa.apellido_paterno} ${pa.apellido_materno || ''}, ${pa.nombre}`.trim(),
                pa.relacion || '—',
                `${pa.tipo_documento || 'Doc.'} ${pa.numero_documento || '—'}`,
                [pa.telefono, pa.email].filter(Boolean).join('\n') || '—',
            ]));
    }

    // ═══════════════════════════════════════════════════════════════
    // MATRÍCULAS
    // ═══════════════════════════════════════════════════════════════
    private renderMatriculas(doc: PDFKit.PDFDocument, d: any) {
        this.sectionTitle(doc, 'Historial de matrículas');
        if (!d.matriculas?.length) {
            this.emptyNote(doc, 'Sin matrículas registradas.');
            return;
        }
        this.table(doc,
            ['Año', 'Grado / Sección', 'Tutor', 'Fecha', 'Estado'],
            [40, 160, 160, 75, 80],
            d.matriculas.map((m: any) => [
                String(m.periodo_anio),
                `${m.grado} — Sección ${m.seccion}`,
                m.tutor_nombre
                    ? `${m.tutor_apellido_paterno} ${m.tutor_apellido_materno || ''}, ${m.tutor_nombre}`.trim()
                    : '—',
                fmtDate(m.fecha_matricula),
                m.activo ? 'Activa' : 'Histórica',
            ]));
    }

    // ═══════════════════════════════════════════════════════════════
    // RESUMEN ACADÉMICO
    // ═══════════════════════════════════════════════════════════════
    private renderResumenAcademico(doc: PDFKit.PDFDocument, d: any) {
        this.sectionTitle(doc, 'Resumen académico');
        const bims = d.notas?.por_bimestre ?? [];
        if (!bims.length) {
            this.emptyNote(doc, 'No hay notas registradas.');
            return;
        }
        this.table(doc,
            ['Año', 'Bimestre', 'Cursos evaluados', 'Promedio'],
            [50, 190, 130, 145],
            bims.map((n: any) => [
                String(n.anio),
                `${n.periodo_nombre} (Bim. ${n.bimestre})`,
                String(n.cursos),
                numFmt(n.promedio_general),
            ]));
    }

    // ═══════════════════════════════════════════════════════════════
    // PROMEDIOS POR CURSO
    // ═══════════════════════════════════════════════════════════════
    private renderPromediosPorCurso(doc: PDFKit.PDFDocument, d: any) {
        this.sectionTitle(doc, 'Promedios por curso');
        const cursos = d.notas?.por_curso_bimestre ?? [];
        if (!cursos.length) {
            this.emptyNote(doc, 'Sin promedios por curso.');
            return;
        }
        this.table(doc,
            ['Año', 'Bimestre', 'Curso', 'Evaluaciones', 'Promedio'],
            [40, 120, 195, 80, 80],
            cursos.map((c: any) => [
                String(c.anio),
                `${c.periodo_nombre} · Bim. ${c.bimestre}`,
                c.curso,
                String(c.cantidad),
                numFmt(c.promedio),
            ]));
    }

    // ═══════════════════════════════════════════════════════════════
    // DETALLE EVALUACIONES
    // ═══════════════════════════════════════════════════════════════
    private renderDetalleEvaluaciones(doc: PDFKit.PDFDocument, d: any) {
        this.sectionTitle(doc, 'Detalle de evaluaciones');
        const det = d.notas?.detalle ?? [];
        if (!det.length) {
            this.emptyNote(doc, 'Sin evaluaciones detalladas.');
            return;
        }
        this.table(doc,
            ['Fecha', 'Periodo', 'Curso', 'Evaluación', 'Tipo', 'Nota'],
            [60, 100, 130, 130, 65, 30],
            det.map((n: any) => [
                n.fecha ? fmtDate(n.fecha) : '—',
                `${n.periodo_nombre} (${n.anio})`,
                n.curso,
                n.titulo,
                n.tipo,
                numFmt(n.nota),
            ]));
    }

    // ═══════════════════════════════════════════════════════════════
    // ASISTENCIA
    // ═══════════════════════════════════════════════════════════════
    private renderAsistencia(doc: PDFKit.PDFDocument, d: any) {
        this.sectionTitle(doc, 'Asistencia');

        const t = d.asistencia?.total ?? {};
        const pct = d.asistencia?.porcentaje_asistencia;

        // Resumen en 6 tarjetas horizontales
        const summaryItems: [string, string][] = [
            ['Total', String(t.total ?? 0)],
            ['Asistió', String(t.asistio ?? 0)],
            ['Tardanza', String(t.tardanza ?? 0)],
            ['Justificado', String(t.justificado ?? 0)],
            ['Falta', String(t.falta ?? 0)],
            ['% Asistencia', pct != null ? `${pct}%` : '—'],
        ];

        const cw = UW / 6 - 3;
        let sx = ML;
        const sy = doc.y;
        for (const [label, value] of summaryItems) {
            doc.roundedRect(sx, sy, cw, CARD_H_SM, 4).fill(STRIPE);
            doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
                .text(label, sx + 4, sy + 4, { width: cw - 8, lineBreak: false });
            doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT)
                .text(value, sx + 4, sy + 14, { width: cw - 8, lineBreak: false });
            sx += cw + 3;
        }
        doc.y = sy + CARD_H_SM + GAP_INNER;

        // Por bimestre
        const bims = d.asistencia?.por_bimestre ?? [];
        if (bims.length) {
            this.table(doc,
                ['Periodo', 'Año', 'Bim.', 'Total', 'Asistió', 'Tardanza', 'Justificado', 'Falta'],
                [120, 38, 32, 42, 52, 58, 68, 105],
                bims.map((a: any) => [
                    a.periodo_nombre,
                    String(a.anio),
                    String(a.bimestre),
                    String(a.total),
                    String(a.asistio),
                    String(a.tardanza),
                    String(a.justificado),
                    String(a.falta),
                ]));
        }

        // Detalle diario
        const det = d.asistencia?.detalle ?? [];
        if (det.length) {
            doc.y += GAP_INNER;
            this.miniTitle(doc, 'Detalle diario');
            this.table(doc,
                ['Fecha', 'Periodo', 'Grado / Sección', 'Estado', 'Observación'],
                [60, 115, 130, 65, 145],
                det.map((a: any) => [
                    fmtDate(a.fecha),
                    `${a.periodo_nombre} (${a.periodo_anio})`,
                    `${a.grado || '—'}${a.seccion ? ' — ' + a.seccion : ''}`,
                    capitalize(a.estado),
                    a.observacion || '—',
                ]));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PSICOLOGÍA + CITAS (juntas para ahorrar espacio)
    // ═══════════════════════════════════════════════════════════════
    private renderPsicologiaCitas(doc: PDFKit.PDFDocument, d: any) {
        const psi = d.psicologia ?? {};
        const citas = d.citas ?? {};

        // ── Psicología ──
        this.sectionTitle(doc, 'Psicología');

        const psiItems: [string, string][] = [
            ['Asignaciones', String(psi.asignaciones ?? 0)],
            ['Fichas', String(psi.fichas ?? 0)],
            ['Última ficha', psi.ultima_ficha ? fmtDate(psi.ultima_ficha) : '—'],
        ];

        const colW3 = UW / 3 - 3;
        let px = ML;
        const py = doc.y;
        for (const [label, value] of psiItems) {
            doc.roundedRect(px, py, colW3, CARD_H_SM, 4).fill(STRIPE);
            doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
                .text(label, px + 7, py + 4, { width: colW3 - 14, lineBreak: false });
            doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT)
                .text(value, px + 7, py + 14, { width: colW3 - 14, lineBreak: false });
            px += colW3 + 4;
        }
        doc.y = py + CARD_H_SM + GAP_INNER;

        if (psi.categorias?.length) {
            this.table(doc,
                ['Categoría', 'Cantidad'],
                [360, 155],
                psi.categorias.map((c: any) => [c.categoria, String(c.cantidad)]));
        }

        // ── Citas ──
        this.sectionTitle(doc, 'Citas');

        const citaItems: [string, string][] = [
            ['Total', String(citas.total ?? 0)],
            ['Pendientes', String(citas.pendientes ?? 0)],
            ['Confirmadas', String(citas.confirmadas ?? 0)],
            ['Realizadas', String(citas.realizadas ?? 0)],
            ['Canceladas', String(citas.canceladas ?? 0)],
        ];

        const cw5 = UW / 5 - 3;
        let cx = ML;
        const cy = doc.y;
        for (const [label, value] of citaItems) {
            doc.roundedRect(cx, cy, cw5, CARD_H_SM, 4).fill(STRIPE);
            doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
                .text(label, cx + 6, cy + 4, { width: cw5 - 12, lineBreak: false });
            doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT)
                .text(value, cx + 6, cy + 14, { width: cw5 - 12, lineBreak: false });
            cx += cw5 + 3;
        }
        doc.y = cy + CARD_H_SM + GAP_INNER;

        const ultimas = citas.ultimas ?? [];
        if (ultimas.length) {
            this.miniTitle(doc, 'Últimas citas');
            this.table(doc,
                ['Fecha', 'Tipo', 'Modalidad', 'Estado', 'Motivo'],
                [95, 75, 75, 75, 195],
                ultimas.map((c: any) => [
                    fmtDT(c.fecha_hora),
                    capitalize(c.tipo),
                    capitalize(c.modalidad),
                    capitalize(c.estado),
                    c.motivo,
                ]));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════

    private sectionTitle(doc: PDFKit.PDFDocument, title: string) {
        this.checkPageBreak(doc, 24);
        doc.y += GAP_SECTION;
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK_BLUE)
            .text(title.toUpperCase(), ML, doc.y);
        doc.y += 3;
        this.hline(doc, doc.y, DARK_BLUE);
        doc.y += GAP_INNER;
    }

    private miniTitle(doc: PDFKit.PDFDocument, title: string) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
            .text(title, ML, doc.y);
        doc.y += GAP_INNER;
    }

    private emptyNote(doc: PDFKit.PDFDocument, msg: string) {
        doc.font('Helvetica').fontSize(8).fillColor(MUTED)
            .text(msg, ML, doc.y);
        doc.y += GAP_INNER;
    }

    private hline(doc: PDFKit.PDFDocument, y: number, color = BORDER) {
        doc.moveTo(ML, y).lineTo(ML + UW, y)
            .strokeColor(color).lineWidth(0.4).stroke();
    }

    private table(
        doc: PDFKit.PDFDocument,
        headers: string[],
        colWidths: number[],
        rows: string[][],
    ) {
        this.checkPageBreak(doc, ROW_H * 2);
        let y = doc.y;

        // Cabecera
        doc.rect(ML, y, UW, ROW_H).fill(PRIMARY);
        let hx = ML;
        doc.font('Helvetica-Bold').fontSize(FONT_SIZE).fillColor(WHITE);
        for (let i = 0; i < headers.length; i++) {
            doc.text(headers[i], hx + 3, y + 5, { width: colWidths[i] - 6, lineBreak: false });
            hx += colWidths[i];
        }
        y += ROW_H;

        // Filas
        for (let ri = 0; ri < rows.length; ri++) {
            const row = rows[ri];

            // Altura dinámica según contenido (saltos de línea en valores)
            const lineH = 11;
            const maxLines = Math.max(1, ...row.map(v => String(v ?? '').split('\n').length));
            const rh = Math.max(ROW_H, maxLines * lineH + 6);

            this.checkPageBreak(doc, rh);
            y = doc.y;

            if (ri % 2 === 1) {
                doc.rect(ML, y, UW, rh).fill(STRIPE);
            }

            let rx = ML;
            doc.font('Helvetica').fontSize(FONT_SIZE).fillColor(TEXT);
            for (let ci = 0; ci < row.length; ci++) {
                const val = String(row[ci] ?? '—');
                doc.text(val, rx + 3, y + 4, {
                    width: colWidths[ci] - 6,
                    lineBreak: true,
                    height: rh,
                });
                rx += colWidths[ci];
            }

            doc.moveTo(ML, y + rh).lineTo(ML + UW, y + rh)
                .strokeColor(BORDER).lineWidth(0.3).stroke();

            doc.y = y + rh;
        }

        doc.y += GAP_INNER;
    }

    private checkPageBreak(doc: PDFKit.PDFDocument, needed: number) {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + needed > bottom) {
            doc.addPage();
            doc.y = doc.page.margins.top;
        }
    }

    private renderFooter(doc: PDFKit.PDFDocument) {
        const range = (doc as any)._pageBuffer?.length ?? 1;
        const bottom = doc.page.height - doc.page.margins.bottom + 12;
        doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
            .text(
                `EduAula — Sistema de Gestión Institucional  •  ${fmtDT(new Date().toISOString())}`,
                ML, bottom, { width: UW, align: 'center' },
            );
    }
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function fmtDate(v: string | null | undefined): string {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtDT(v: string | null | undefined): string {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return `${fmtDate(v)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function numFmt(v: any): string {
    if (v === null || v === undefined) return '—';
    const n = Number(v);
    return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : '—';
}

function capitalize(s: string | null | undefined): string {
    if (!s) return '—';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function calcEdad(fechaNacimiento: string | null | undefined): number | null {
    if (!fechaNacimiento) return null;
    const hoy = new Date();
    const nac = new Date(fechaNacimiento);
    if (isNaN(nac.getTime())) return null;
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
}

function promedioGeneral(d: any): string {
    const bims = d.notas?.por_bimestre ?? [];
    if (!bims.length) return '—';
    const sum = bims.reduce((acc: number, b: any) => acc + Number(b.promedio_general ?? 0), 0);
    return (sum / bims.length).toFixed(2);
}