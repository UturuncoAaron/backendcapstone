import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AcademicYear } from './entities/academic-year.entity.js';
import {
  BulkCondicionFinalDto,
  CreateAcademicYearDto,
  SetCondicionFinalDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto.js';

interface MatriculaBaseRow {
  id: string;
  alumno_id: string;
  seccion_id: string;
  grado_orden: number;
  seccion_nombre: string;
  condicion_final: string;
  activo: boolean;
}

interface AprobadoRow {
  alumno_id: string;
  matricula_id: string;
  origen_grado_orden: number;
  origen_seccion_nombre: string;
  destino_seccion_id: string | null;
}

interface DesaprobadoRow {
  alumno_id: string;
  matricula_id: string;
  seccion_id: string;
}

interface PromotionPreviewRow {
  alumno_id: string;
  alumno_nombre: string;
  origen_grado_orden: number;
  origen_grado_id: string;
  origen_grado_nombre: string;
  origen_seccion_id: string;
  origen_seccion_nombre: string;
  destino_grado_id: string | null;
  destino_grado_nombre: string | null;
  destino_seccion_id: string | null;
  destino_seccion_nombre: string | null;
  es_egresado: boolean;
  ya_promovido: boolean;
}

export interface PromotionPreview {
  anio: number;
  totalAprobados: number;
  totalEgresados: number;
  totalRepetidores: number;
  totalSinDestino: number;
  rows: PromotionPreviewRow[];
}

export interface PromotionResult {
  creadas: number;
  egresados: number;
  repetidores: number;
}

export interface RematricularResult {
  mensaje: string;
  matricula_id?: string;
}

@Injectable()
export class AcademicYearService {
  private readonly logger = new Logger(AcademicYearService.name);
  private readonly ULTIMO_GRADO_ORDEN = 5;

  constructor(
    @InjectRepository(AcademicYear)
    private readonly repo: Repository<AcademicYear>,
    @InjectDataSource()
    private readonly ds: DataSource,
  ) { }

  list(): Promise<AcademicYear[]> {
    return this.repo.find({ order: { anio: 'DESC' } });
  }

  async getCurrent(): Promise<AcademicYear | null> {
    return (
      (await this.repo.findOne({
        where: { estado: 'en_curso' },
        order: { anio: 'DESC' },
      })) ?? null
    );
  }

  async getByAnio(anio: number): Promise<AcademicYear> {
    const row = await this.repo.findOne({ where: { anio } });
    if (!row) throw new NotFoundException(`Año lectivo ${anio} no existe`);
    return row;
  }

  async create(dto: CreateAcademicYearDto): Promise<AcademicYear> {
    const existing = await this.repo.findOne({ where: { anio: dto.anio } });
    if (existing)
      throw new ConflictException(`El año lectivo ${dto.anio} ya existe`);
    if (dto.fechaFin <= dto.fechaInicio)
      throw new BadRequestException('fechaFin debe ser posterior a fechaInicio');
    return this.repo.save(
      this.repo.create({
        anio: dto.anio,
        fechaInicio: dto.fechaInicio,
        fechaFin: dto.fechaFin,
        estado: 'planificado',
      }),
    );
  }

  async update(anio: number, dto: UpdateAcademicYearDto): Promise<AcademicYear> {
    const ay = await this.getByAnio(anio);
    if (ay.estado === 'cerrado' || ay.estado === 'archivado')
      throw new BadRequestException(
        `No se puede editar un año lectivo en estado "${ay.estado}"`,
      );
    if (dto.fechaInicio) ay.fechaInicio = dto.fechaInicio;
    if (dto.fechaFin) ay.fechaFin = dto.fechaFin;
    if (ay.fechaFin <= ay.fechaInicio)
      throw new BadRequestException('fechaFin debe ser posterior a fechaInicio');
    return this.repo.save(ay);
  }

  async activate(anio: number): Promise<AcademicYear> {
    const ay = await this.getByAnio(anio);
    if (ay.estado === 'en_curso') return ay;
    if (ay.estado !== 'planificado')
      throw new BadRequestException(
        `Solo un año "planificado" puede activarse (está "${ay.estado}")`,
      );
    const otroEnCurso = await this.repo.findOne({ where: { estado: 'en_curso' } });
    if (otroEnCurso && otroEnCurso.anio !== ay.anio)
      throw new ConflictException(
        `El año ${otroEnCurso.anio} ya está en curso. Ciérralo primero.`,
      );
    ay.estado = 'en_curso';
    return this.repo.save(ay);
  }

  async setCondicionFinal(
    matriculaId: string,
    dto: SetCondicionFinalDto,
  ): Promise<{ id: string; condicion_final: string; activo: boolean }> {
    const esRetirado = dto.condicion === 'retirado';
    type Row = { id: string; condicion_final: string; activo: boolean };

    const updated = await this.ds.query<Row[]>(
      `UPDATE matriculas
          SET condicion_final = $2,
              activo = CASE WHEN $3 THEN FALSE ELSE activo END
        WHERE id = $1
        RETURNING id, condicion_final, activo`,
      [matriculaId, dto.condicion, esRetirado],
    );
    if (updated.length === 0)
      throw new NotFoundException('Matrícula no encontrada');
    if (esRetirado)
      this.logger.log(`Matrícula ${matriculaId} → RETIRADO, activo=false`);
    return updated[0];
  }

  async bulkSetCondicionFinal(
    dto: BulkCondicionFinalDto,
  ): Promise<{ actualizadas: number }> {
    if (dto.condicion === ('retirado' as string))
      throw new BadRequestException(
        'No se puede marcar como retirado en bulk. Hazlo individualmente.',
      );

    const params: unknown[] = [dto.anio, dto.condicion];
    const conditions: string[] = ['m.anio = $1', 'm.activo = TRUE'];

    if (dto.seccion_id) {
      params.push(dto.seccion_id);
      conditions.push(`m.seccion_id = $${params.length}`);
    } else if (dto.grado_id) {
      params.push(dto.grado_id);
      conditions.push(
        `m.seccion_id IN (SELECT id FROM secciones WHERE grado_id = $${params.length})`,
      );
    }

    const result = await this.ds.query<{ id: string }[]>(
      `UPDATE matriculas m SET condicion_final = $2 WHERE ${conditions.join(' AND ')} RETURNING m.id`,
      params,
    );

    this.logger.log(
      `Bulk condicion="${dto.condicion}" → ${result.length} matrículas ` +
      `(anio=${dto.anio}, grado=${dto.grado_id ?? '-'}, seccion=${dto.seccion_id ?? '-'})`,
    );
    return { actualizadas: result.length };
  }

  async cambiarSeccion(
    matriculaId: string,
    seccionId: string,
  ): Promise<{ id: string; seccion_id: string }> {
    const secRows = await this.ds.query<{ id: string }[]>(
      `SELECT id FROM secciones WHERE id = $1 AND activo = TRUE`,
      [seccionId],
    );
    if (secRows.length === 0)
      throw new NotFoundException(`Sección ${seccionId} no encontrada o inactiva`);

    const matRows = await this.ds.query<{ id: string; alumno_id: string; anio: number }[]>(
      `SELECT id, alumno_id, anio FROM matriculas WHERE id = $1`,
      [matriculaId],
    );
    if (matRows.length === 0)
      throw new NotFoundException('Matrícula no encontrada');

    const mat = matRows[0];
    const conflicto = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM matriculas
        WHERE alumno_id = $1 AND seccion_id = $2 AND anio = $3 AND id <> $4`,
      [mat.alumno_id, seccionId, mat.anio, matriculaId],
    );
    if (Number(conflicto[0].count) > 0)
      throw new ConflictException(
        'El alumno ya tiene una matrícula en esa sección para ese año.',
      );

    const updated = await this.ds.query<{ id: string; seccion_id: string }[]>(
      `UPDATE matriculas SET seccion_id = $2 WHERE id = $1 RETURNING id, seccion_id`,
      [matriculaId, seccionId],
    );
    this.logger.log(`Matrícula ${matriculaId}: sección → ${seccionId}`);
    return updated[0];
  }

  async previewPromotion(anio: number): Promise<PromotionPreview> {
    await this.getByAnio(anio);

    const rows = await this.ds.query<PromotionPreviewRow[]>(
      `WITH origen AS (
         SELECT m.id AS matricula_id, m.alumno_id,
                a.nombre || ' ' || a.apellido_paterno AS alumno_nombre,
                s.id AS origen_seccion_id, s.nombre AS origen_seccion_nombre,
                g.id AS origen_grado_id, g.nombre AS origen_grado_nombre,
                g.orden AS origen_grado_orden, m.condicion_final
           FROM matriculas m
           JOIN alumnos   a ON a.id = m.alumno_id
           JOIN secciones s ON s.id = m.seccion_id
           JOIN grados    g ON g.id = s.grado_id
          WHERE m.anio = $1 AND m.activo = TRUE AND m.condicion_final = 'aprobado'
       ),
       destino AS (
         SELECT o.*,
                dest_g.id AS destino_grado_id, dest_g.nombre AS destino_grado_nombre,
                dest_s.id AS destino_seccion_id, dest_s.nombre AS destino_seccion_nombre,
                (o.origen_grado_orden >= $2) AS es_egresado
           FROM origen o
           LEFT JOIN grados    dest_g ON dest_g.orden    = o.origen_grado_orden + 1
           LEFT JOIN secciones dest_s ON dest_s.grado_id = dest_g.id
                                     AND dest_s.nombre   = o.origen_seccion_nombre
                                     AND dest_s.activo   = TRUE
       )
       SELECT d.alumno_id, d.alumno_nombre, d.origen_grado_orden,
              d.origen_grado_id, d.origen_grado_nombre,
              d.origen_seccion_id, d.origen_seccion_nombre,
              d.destino_grado_id, d.destino_grado_nombre,
              d.destino_seccion_id, d.destino_seccion_nombre,
              d.es_egresado,
              EXISTS (
                SELECT 1 FROM matriculas mm
                 WHERE mm.alumno_id = d.alumno_id AND mm.anio = $1 + 1
              ) AS ya_promovido
         FROM destino d
        ORDER BY d.origen_grado_orden, d.origen_seccion_nombre, d.alumno_nombre`,
      [anio, this.ULTIMO_GRADO_ORDEN],
    );

    const repResult = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM matriculas
        WHERE anio = $1 AND activo = TRUE AND condicion_final = 'desaprobado'`,
      [anio],
    );
    const pendResult = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM matriculas
        WHERE anio = $1 AND activo = TRUE AND condicion_final = 'pendiente'`,
      [anio],
    );

    const totalEgresados = rows.filter((r) => r.es_egresado).length;
    return {
      anio,
      totalAprobados: rows.filter((r) => !r.es_egresado).length,
      totalEgresados,
      totalRepetidores: Number(repResult[0]?.count ?? 0),
      totalSinDestino: Number(pendResult[0]?.count ?? 0),
      rows,
    };
  }

  async runPromotion(anio: number): Promise<PromotionResult> {
    const ay = await this.getByAnio(anio);
    if (ay.promocionEjecutadaAt) {
      this.logger.warn(`Promoción ${anio} ya ejecutada — no-op`);
      return this.getPromotionStats(anio + 1);
    }

    return this.ds.transaction('SERIALIZABLE', async (em) => {

      // ── BLOQUEO previo: aprobados sin sección destino ──────────
      const sinDestino = await em.query<{ count: number; detalle: string }[]>(`
      SELECT
        COUNT(*)::int AS count,
        STRING_AGG(DISTINCT g.nombre || ' — Sec. ' || s.nombre, ', ') AS detalle
      FROM matriculas m
      JOIN secciones s ON s.id = m.seccion_id
      JOIN grados    g ON g.id = s.grado_id
      WHERE m.anio = $1
        AND m.activo = TRUE
        AND m.condicion_final = 'aprobado'
        AND g.orden < $2
        AND NOT EXISTS (
          SELECT 1 FROM secciones ds
            JOIN grados dg ON dg.id = ds.grado_id
           WHERE dg.orden  = g.orden + 1
             AND ds.nombre = s.nombre
             AND ds.activo = TRUE
        )
    `, [anio, this.ULTIMO_GRADO_ORDEN]);

      if (sinDestino[0].count > 0) {
        throw new BadRequestException(
          `No se puede ejecutar la promoción: ${sinDestino[0].count} alumno(s) aprobado(s) ` +
          `no tienen sección destino. Crea primero: ${sinDestino[0].detalle}.`
        );
      }
      // ──────────────────────────────────────────────────────────

      const aprobados = await em.query<AprobadoRow[]>(
        `SELECT m.id AS matricula_id, m.alumno_id,
              g.orden AS origen_grado_orden, s.nombre AS origen_seccion_nombre,
              (
                SELECT ds.id FROM secciones ds
                  JOIN grados dg ON dg.id = ds.grado_id
                 WHERE dg.orden = g.orden + 1 AND ds.nombre = s.nombre AND ds.activo = TRUE
                 LIMIT 1
              ) AS destino_seccion_id
         FROM matriculas m
         JOIN secciones s ON s.id = m.seccion_id
         JOIN grados    g ON g.id = s.grado_id
        WHERE m.anio = $1 AND m.activo = TRUE AND m.condicion_final = 'aprobado'`,
        [anio],
      );

      let creadas = 0;
      let egresados = 0;

      for (const r of aprobados) {
        if (r.origen_grado_orden >= this.ULTIMO_GRADO_ORDEN) {
          egresados++;
          await em.query(`UPDATE matriculas SET activo = FALSE WHERE id = $1`, [r.matricula_id]);
          continue;
        }
        // Con el bloqueo previo esto nunca debería ocurrir, pero por seguridad:
        if (!r.destino_seccion_id) {
          this.logger.error(
            `BUG: alumno ${r.alumno_id} sin destino tras bloqueo (orden=${r.origen_grado_orden}, seccion=${r.origen_seccion_nombre})`,
          );
          throw new BadRequestException(
            `Error inesperado: alumno ${r.alumno_id} sin sección destino. Verifica las secciones.`
          );
        }
        await em.query(
          `INSERT INTO matriculas (alumno_id, seccion_id, anio, activo, condicion_final)
         VALUES ($1, $2, $3, TRUE, 'pendiente')
         ON CONFLICT (alumno_id, seccion_id, anio) DO NOTHING`,
          [r.alumno_id, r.destino_seccion_id, anio + 1],
        );
        await em.query(`UPDATE matriculas SET activo = FALSE WHERE id = $1`, [r.matricula_id]);
        creadas++;
      }

      const desaprobados = await em.query<DesaprobadoRow[]>(
        `SELECT id AS matricula_id, alumno_id, seccion_id FROM matriculas
        WHERE anio = $1 AND activo = TRUE AND condicion_final = 'desaprobado'`,
        [anio],
      );

      let repetidores = 0;
      for (const r of desaprobados) {
        await em.query(
          `INSERT INTO matriculas (alumno_id, seccion_id, anio, activo, condicion_final)
         VALUES ($1, $2, $3, TRUE, 'pendiente')
         ON CONFLICT (alumno_id, anio) DO NOTHING`,
          [r.alumno_id, r.seccion_id, anio + 1],
        );
        await em.query(`UPDATE matriculas SET activo = FALSE WHERE id = $1`, [r.matricula_id]);
        repetidores++;
      }

      const saltados = await em.query<{ id: string }[]>(
        `UPDATE matriculas SET activo = FALSE
        WHERE anio = $1 AND activo = TRUE AND condicion_final = 'pendiente'
        RETURNING id`,
        [anio],
      );
      if (saltados.length > 0)
        this.logger.warn(
          `Promoción ${anio}: ${saltados.length} pendientes saltados — ` +
          `usar POST academic-years/${anio}/rematriculas/:id`,
        );

      await em.query(
        `UPDATE anios_lectivos
          SET estado = 'cerrado', promocion_ejecutada_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
        [ay.id],
      );

      this.logger.log(
        `Promoción ${anio}: ${creadas} promovidos, ${repetidores} repetidores, ${egresados} egresados`,
      );
      return { creadas, egresados, repetidores };
    });
  }

  async rematricularAlumno(
    anio: number,
    matriculaId: string,
    condicion: 'aprobado' | 'desaprobado',
  ): Promise<RematricularResult> {
    const ay = await this.getByAnio(anio);
    if (!ay.promocionEjecutadaAt)
      throw new BadRequestException(
        'La promoción aún no fue ejecutada. Usa PATCH academic-years/matriculas/:id/condicion-final.',
      );

    const rows = await this.ds.query<MatriculaBaseRow[]>(
      `SELECT m.id, m.alumno_id, m.seccion_id, m.condicion_final, m.activo,
              g.orden AS grado_orden, s.nombre AS seccion_nombre
         FROM matriculas m
         JOIN secciones s ON s.id = m.seccion_id
         JOIN grados    g ON g.id = s.grado_id
        WHERE m.id = $1 AND m.anio = $2`,
      [matriculaId, anio],
    );
    if (rows.length === 0)
      throw new NotFoundException(`Matrícula ${matriculaId} no encontrada para el año ${anio}`);

    const m = rows[0];
    if (m.condicion_final !== 'pendiente')
      throw new BadRequestException(
        `Matrícula ya tiene condición "${m.condicion_final}". Solo se puede rematricular con condición "pendiente".`,
      );

    const yaExiste = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM matriculas
        WHERE alumno_id = $1 AND anio = $2 AND activo = TRUE`,
      [m.alumno_id, anio + 1],
    );
    if (Number(yaExiste[0].count) > 0)
      throw new ConflictException(
        `El alumno ya tiene matrícula activa para ${anio + 1}.`,
      );

    return this.ds.transaction('SERIALIZABLE', async (em) => {
      await em.query(`UPDATE matriculas SET condicion_final = $2 WHERE id = $1`, [matriculaId, condicion]);

      if (condicion === 'aprobado' && m.grado_orden >= this.ULTIMO_GRADO_ORDEN) {
        this.logger.log(`Rematricula ${anio}: alumno ${m.alumno_id} → egresado tardío`);
        return { mensaje: `Alumno marcado como egresado de ${anio}. No se crea matrícula para ${anio + 1}.` };
      }

      const ordenDestino = condicion === 'aprobado' ? m.grado_orden + 1 : m.grado_orden;
      const destRows = await em.query<{ id: string }[]>(
        `SELECT ds.id FROM secciones ds
           JOIN grados dg ON dg.id = ds.grado_id
          WHERE dg.orden = $1 AND ds.nombre = $2 AND ds.activo = TRUE LIMIT 1`,
        [ordenDestino, m.seccion_nombre],
      );
      if (destRows.length === 0)
        throw new BadRequestException(
          `No existe la sección "${m.seccion_nombre}" para grado orden ${ordenDestino}. Créala en Grados y Cursos.`,
        );

      const result = await em.query<{ id: string }[]>(
        `INSERT INTO matriculas (alumno_id, seccion_id, anio, activo, condicion_final)
         VALUES ($1, $2, $3, TRUE, 'pendiente')
         ON CONFLICT (alumno_id, anio) DO NOTHING
         RETURNING id`,
        [m.alumno_id, destRows[0].id, anio + 1],
      );

      const accion = condicion === 'aprobado' ? 'promovido' : 'repetidor';
      this.logger.log(`Rematricula ${anio}: alumno ${m.alumno_id} → ${accion} en ${anio + 1}`);
      return { mensaje: `Alumno rematriculado en ${anio + 1} como ${accion}.`, matricula_id: result[0]?.id };
    });
  }

  async runEgresadoDeactivation(anio: number): Promise<{ desactivados: number }> {
    const ay = await this.getByAnio(anio);
    if (ay.estado !== 'cerrado')
      throw new BadRequestException(
        `El año ${anio} debe estar "cerrado" (estado actual: "${ay.estado}")`,
      );
    if (ay.egresadosDesactivadosAt) {
      this.logger.log(`Egresados ${anio} ya desactivados — no-op`);
      return { desactivados: 0 };
    }

    const diffDias = Math.floor(
      (Date.now() - new Date(ay.fechaFin + 'T00:00:00Z').getTime()) / 86_400_000,
    );
    if (diffDias < 30)
      throw new BadRequestException(
        `Faltan ${30 - diffDias} día(s) para poder desactivar egresados del año ${anio}.`,
      );

    return this.ds.transaction(async (em) => {
      const res = await em.query<{ id: string }[]>(
        `UPDATE cuentas c
            SET activo = FALSE, updated_at = NOW()
          WHERE c.rol = 'alumno' AND c.activo = TRUE
            AND c.id IN (
              SELECT m.alumno_id FROM matriculas m
                JOIN secciones s ON s.id = m.seccion_id
                JOIN grados    g ON g.id = s.grado_id
               WHERE m.anio = $1 AND g.orden = $2 AND m.condicion_final = 'aprobado'
            )
         RETURNING c.id`,
        [anio, this.ULTIMO_GRADO_ORDEN],
      );
      await em.query(
        `UPDATE anios_lectivos SET egresados_desactivados_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [ay.id],
      );
      this.logger.log(`Egresados ${anio}: ${res.length} cuentas desactivadas`);
      return { desactivados: res.length };
    });
  }

  private async getPromotionStats(anio: number): Promise<PromotionResult> {
    const stats = await this.ds.query<{ creadas: string; egresados: string; repetidores: string }[]>(
      `SELECT
         (SELECT COUNT(*)::text FROM matriculas WHERE anio = $1) AS creadas,
         (SELECT COUNT(*)::text FROM matriculas m
           JOIN secciones s ON s.id = m.seccion_id
           JOIN grados    g ON g.id = s.grado_id
          WHERE m.anio = $1 AND g.orden < $2) AS repetidores,
         (SELECT COUNT(*)::text FROM matriculas m
           JOIN secciones s ON s.id = m.seccion_id
           JOIN grados    g ON g.id = s.grado_id
          WHERE m.anio = $1 - 1 AND g.orden = $2 AND m.condicion_final = 'aprobado') AS egresados`,
      [anio, this.ULTIMO_GRADO_ORDEN],
    );
    return {
      creadas: Number(stats[0]?.creadas ?? 0),
      egresados: Number(stats[0]?.egresados ?? 0),
      repetidores: Number(stats[0]?.repetidores ?? 0),
    };
  }
}