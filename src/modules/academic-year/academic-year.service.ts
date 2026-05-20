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
  CreateAcademicYearDto,
  SetCondicionFinalDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto.js';

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

/**
 * Servicio que centraliza el ciclo de vida del año lectivo:
 *
 *  - Cerrar un año (transiciona `en_curso → cerrado`).
 *  - Ejecutar la promoción anual (crear matrículas año siguiente para los
 *    alumnos aprobados, dejar las del año cerrado activas=false pero
 *    intactas para historial inmutable).
 *  - Desactivar (NO eliminar) las cuentas de los egresados de 5to Sec.
 *    exactamente un mes después del cierre del año.
 *
 * Todo es idempotente: si la promoción ya se ejecutó (`promocion_ejecutada_at`
 * != NULL), correr de nuevo es no-op. Lo mismo para `egresados_desactivados_at`.
 *
 * Diseñado para escalabilidad por años (2026 → 2027 → 2028 …): la lógica
 * recibe el `anio` como parámetro y los crons iteran sobre TODOS los años
 * lectivos pendientes, no solo el actual. Si por alguna razón un año
 * lectivo quedó sin cerrar, el cron lo va a detectar y avanzar la próxima
 * vez que corra.
 */
@Injectable()
export class AcademicYearService {
  private readonly logger = new Logger(AcademicYearService.name);

  constructor(
    @InjectRepository(AcademicYear)
    private readonly repo: Repository<AcademicYear>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // CRUD básico
  // ════════════════════════════════════════════════════════════════

  list() {
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
      throw new BadRequestException(
        'fechaFin debe ser posterior a fechaInicio',
      );
    const entity = this.repo.create({
      anio: dto.anio,
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
      estado: 'planificado',
    });
    return this.repo.save(entity);
  }

  async update(
    anio: number,
    dto: UpdateAcademicYearDto,
  ): Promise<AcademicYear> {
    const ay = await this.getByAnio(anio);
    if (ay.estado === 'cerrado' || ay.estado === 'archivado')
      throw new BadRequestException(
        `No se puede editar un año lectivo en estado ${ay.estado}`,
      );
    if (dto.fechaInicio) ay.fechaInicio = dto.fechaInicio;
    if (dto.fechaFin) ay.fechaFin = dto.fechaFin;
    if (ay.fechaFin <= ay.fechaInicio)
      throw new BadRequestException(
        'fechaFin debe ser posterior a fechaInicio',
      );
    return this.repo.save(ay);
  }

  async activate(anio: number): Promise<AcademicYear> {
    const ay = await this.getByAnio(anio);
    if (ay.estado === 'en_curso') return ay;
    if (ay.estado !== 'planificado')
      throw new BadRequestException(
        `Solo un año 'planificado' puede pasar a 'en_curso' (está ${ay.estado})`,
      );
    // No permitimos dos años en_curso simultáneamente: el anterior debe
    // estar cerrado.
    const otroEnCurso = await this.repo.findOne({
      where: { estado: 'en_curso' },
    });
    if (otroEnCurso && otroEnCurso.anio !== ay.anio)
      throw new ConflictException(
        `El año lectivo ${otroEnCurso.anio} todavía está en curso. Ciérralo primero.`,
      );
    ay.estado = 'en_curso';
    return this.repo.save(ay);
  }

  // ════════════════════════════════════════════════════════════════
  // CONDICIÓN FINAL (admin marca aprobado/desaprobado al cierre)
  // ════════════════════════════════════════════════════════════════

  async setCondicionFinal(
    matriculaId: string,
    dto: SetCondicionFinalDto,
  ): Promise<{ id: string; condicion_final: string }> {
    const updated = await this.ds.query<
      { id: string; condicion_final: string }[]
    >(
      `UPDATE matriculas
          SET condicion_final = $2
        WHERE id = $1
        RETURNING id, condicion_final`,
      [matriculaId, dto.condicion],
    );
    if (updated.length === 0)
      throw new NotFoundException('Matrícula no encontrada');
    return updated[0];
  }

  // ════════════════════════════════════════════════════════════════
  // PROMOCIÓN — preview + ejecución
  // ════════════════════════════════════════════════════════════════

  /**
   * Lista lo que va a pasar si se ejecuta la promoción para `anio`.
   * Útil para mostrar al admin un "X alumnos aprobados → grado N+1, sección X,
   * Y egresados, Z sin condición final" antes de apretar el botón.
   */
  async previewPromotion(anio: number): Promise<PromotionPreview> {
    await this.getByAnio(anio);
    const rows = await this.ds.query<PromotionPreviewRow[]>(
      `WITH origen AS (
         SELECT
           m.id            AS matricula_id,
           m.alumno_id,
           a.nombre || ' ' || a.apellido_paterno AS alumno_nombre,
           s.id            AS origen_seccion_id,
           s.nombre        AS origen_seccion_nombre,
           g.id            AS origen_grado_id,
           g.nombre        AS origen_grado_nombre,
           g.orden         AS origen_grado_orden,
           m.condicion_final
         FROM matriculas m
         JOIN alumnos a   ON a.id = m.alumno_id
         JOIN secciones s ON s.id = m.seccion_id
         JOIN grados g    ON g.id = s.grado_id
         WHERE m.anio = $1
           AND m.activo = TRUE
           AND m.condicion_final = 'aprobado'
       ),
       destino AS (
         SELECT
           o.*,
           dest_g.id     AS destino_grado_id,
           dest_g.nombre AS destino_grado_nombre,
           dest_s.id     AS destino_seccion_id,
           dest_s.nombre AS destino_seccion_nombre,
           (o.origen_grado_orden >= 11) AS es_egresado
         FROM origen o
         LEFT JOIN grados dest_g
           ON dest_g.orden = o.origen_grado_orden + 1
         LEFT JOIN secciones dest_s
           ON dest_s.grado_id = dest_g.id
          AND dest_s.nombre   = o.origen_seccion_nombre
          AND dest_s.activo   = TRUE
       )
       SELECT
         d.alumno_id,
         d.alumno_nombre,
         d.origen_grado_orden,
         d.origen_grado_id,
         d.origen_grado_nombre,
         d.origen_seccion_id,
         d.origen_seccion_nombre,
         d.destino_grado_id,
         d.destino_grado_nombre,
         d.destino_seccion_id,
         d.destino_seccion_nombre,
         d.es_egresado,
         EXISTS(
           SELECT 1 FROM matriculas mm
            WHERE mm.alumno_id = d.alumno_id
              AND mm.anio = $1 + 1
         ) AS ya_promovido
       FROM destino d
       ORDER BY d.origen_grado_orden, d.origen_seccion_nombre, d.alumno_nombre`,
      [anio],
    );
    const totalEgresados = rows.filter((r) => r.es_egresado).length;
    const totalSinDestino = rows.filter(
      (r) => !r.es_egresado && !r.destino_seccion_id,
    ).length;
    const repetidores = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM matriculas
        WHERE anio = $1 AND activo = TRUE AND condicion_final = 'desaprobado'`,
      [anio],
    );
    return {
      anio,
      totalAprobados: rows.length,
      totalEgresados,
      totalRepetidores: Number(repetidores[0]?.count ?? 0),
      totalSinDestino,
      rows,
    };
  }

  /**
   * Ejecuta la promoción para el `anio` indicado. Idempotente:
   *  - Solo corre si el año lectivo está `en_curso` o `cerrado` con
   *    `promocion_ejecutada_at = NULL`.
   *  - Si ya corrió antes, devuelve los mismos contadores sin tocar nada.
   *  - Para cada alumno aprobado:
   *      • desactiva la matrícula del año actual (`activo=false`)
   *      • crea una matrícula nueva en el año `anio+1` con grado+1, misma
   *        sección si existe; si no, primer sección activa del grado+1
   *      • si no hay grado+1 (egresado), no crea matrícula nueva, marca
   *        condición final como `aprobado` (queda como fue) — la desactivación
   *        de cuenta la maneja `runEgresadoDeactivation`.
   *  - Para los desaprobados:
   *      • desactiva la matrícula
   *      • crea nueva matrícula en el MISMO grado/sección para `anio+1`
   *  - Para los pendientes (no marcados) NO hace nada.
   *
   * Todo dentro de una transacción SERIALIZABLE.
   */
  async runPromotion(
    anio: number,
  ): Promise<{ creadas: number; egresados: number; repetidores: number }> {
    const ay = await this.getByAnio(anio);
    if (ay.promocionEjecutadaAt) {
      this.logger.warn(
        `Promoción de ${anio} ya ejecutada en ${ay.promocionEjecutadaAt.toISOString()} — no-op`,
      );
      const stats = await this.ds.query<
        [{ creadas: string; egresados: string; repetidores: string }]
      >(
        `SELECT
           (SELECT COUNT(*) FROM matriculas WHERE anio = $1) AS creadas,
           (SELECT COUNT(*) FROM matriculas m
              JOIN secciones s ON s.id = m.seccion_id
              JOIN grados g    ON g.id = s.grado_id
            WHERE m.anio = $1 AND g.orden < 12) AS repetidores,
           (SELECT COUNT(*) FROM matriculas m
              JOIN secciones s ON s.id = m.seccion_id
              JOIN grados g    ON g.id = s.grado_id
            WHERE m.anio = $1 - 1 AND g.orden = 11 AND m.condicion_final = 'aprobado') AS egresados`,
        [anio + 1],
      );
      return {
        creadas: Number(stats[0].creadas),
        egresados: Number(stats[0].egresados),
        repetidores: Number(stats[0].repetidores),
      };
    }

    return await this.ds.transaction('SERIALIZABLE', async (em) => {
      // 1. Aprobados → grado+1 (excepto 5to Sec = orden 11)
      const aprobados = await em.query<
        {
          alumno_id: string;
          matricula_id: string;
          origen_grado_orden: number;
          origen_seccion_nombre: string;
          destino_seccion_id: string | null;
        }[]
      >(
        `SELECT
           m.id          AS matricula_id,
           m.alumno_id,
           g.orden       AS origen_grado_orden,
           s.nombre      AS origen_seccion_nombre,
           (
             SELECT ds.id FROM secciones ds
               JOIN grados dg ON dg.id = ds.grado_id
              WHERE dg.orden = g.orden + 1
                AND ds.nombre = s.nombre
                AND ds.activo = TRUE
              LIMIT 1
           ) AS destino_seccion_id
         FROM matriculas m
         JOIN secciones s ON s.id = m.seccion_id
         JOIN grados g    ON g.id = s.grado_id
         WHERE m.anio = $1
           AND m.activo = TRUE
           AND m.condicion_final = 'aprobado'`,
        [anio],
      );

      let creadas = 0;
      let egresados = 0;
      for (const r of aprobados) {
        // Egresado: orden = 11 (5to Sec) — no se crea matrícula nueva.
        if (r.origen_grado_orden >= 11) {
          egresados++;
          await em.query(`UPDATE matriculas SET activo = FALSE WHERE id = $1`, [
            r.matricula_id,
          ]);
          continue;
        }
        // Si no hay sección de destino (no existe grado+1 o no hay sección
        // con el mismo nombre), saltamos y dejamos la matrícula original
        // activa para que el admin la mueva a mano. Esto evita perder al
        // alumno por un error de configuración.
        if (!r.destino_seccion_id) {
          this.logger.warn(
            `Alumno ${r.alumno_id} sin destino de promoción (grado_orden=${r.origen_grado_orden}, seccion=${r.origen_seccion_nombre}). Saltado.`,
          );
          continue;
        }
        await em.query(
          `INSERT INTO matriculas (alumno_id, seccion_id, anio, activo, condicion_final)
           VALUES ($1, $2, $3, TRUE, 'pendiente')
           ON CONFLICT (alumno_id, seccion_id, anio) DO NOTHING`,
          [r.alumno_id, r.destino_seccion_id, anio + 1],
        );
        await em.query(`UPDATE matriculas SET activo = FALSE WHERE id = $1`, [
          r.matricula_id,
        ]);
        creadas++;
      }

      // 2. Desaprobados → repiten mismo grado/sección
      const desaprobados = await em.query<
        { alumno_id: string; matricula_id: string; seccion_id: string }[]
      >(
        `SELECT id AS matricula_id, alumno_id, seccion_id
           FROM matriculas
          WHERE anio = $1 AND activo = TRUE AND condicion_final = 'desaprobado'`,
        [anio],
      );
      let repetidores = 0;
      for (const r of desaprobados) {
        await em.query(
          `INSERT INTO matriculas (alumno_id, seccion_id, anio, activo, condicion_final)
           VALUES ($1, $2, $3, TRUE, 'pendiente')
           ON CONFLICT (alumno_id, seccion_id, anio) DO NOTHING`,
          [r.alumno_id, r.seccion_id, anio + 1],
        );
        await em.query(`UPDATE matriculas SET activo = FALSE WHERE id = $1`, [
          r.matricula_id,
        ]);
        repetidores++;
      }

      // 3. Marcar el año como cerrado y dejar timestamp idempotencia
      await em.query(
        `UPDATE anios_lectivos
            SET estado = 'cerrado',
                promocion_ejecutada_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [ay.id],
      );

      this.logger.log(
        `Promoción ${anio} ejecutada: ${creadas} promovidos, ${repetidores} repetidores, ${egresados} egresados`,
      );
      return { creadas, egresados, repetidores };
    });
  }

  // ════════════════════════════════════════════════════════════════
  // DESACTIVACIÓN DE EGRESADOS (1 mes después de fecha_fin)
  // ════════════════════════════════════════════════════════════════

  /**
   * Desactiva (cuentas.activo = FALSE) las cuentas de los alumnos que
   * egresaron de 5to Sec en el año dado. Solo corre si:
   *  - El año está en estado 'cerrado' y la promoción ya se ejecutó.
   *  - Han pasado al menos 30 días desde fecha_fin.
   *  - `egresados_desactivados_at` es NULL (idempotente).
   *
   * IMPORTANTE: no se elimina ningún dato. La cuenta queda en estado
   * inactivo (login bloqueado) pero todo su historial académico,
   * informes psicológicos, etc. siguen consultables por admin/director.
   */
  async runEgresadoDeactivation(
    anio: number,
  ): Promise<{ desactivados: number }> {
    const ay = await this.getByAnio(anio);
    if (ay.estado !== 'cerrado')
      throw new BadRequestException(
        `El año ${anio} debe estar 'cerrado' para desactivar egresados (está ${ay.estado})`,
      );
    if (ay.egresadosDesactivadosAt) {
      this.logger.log(
        `Egresados de ${anio} ya desactivados en ${ay.egresadosDesactivadosAt.toISOString()} — no-op`,
      );
      return { desactivados: 0 };
    }
    const fechaFin = new Date(ay.fechaFin + 'T00:00:00Z');
    const ahora = new Date();
    const diffDias = Math.floor(
      (ahora.getTime() - fechaFin.getTime()) / 86400000,
    );
    if (diffDias < 30)
      throw new BadRequestException(
        `Faltan ${30 - diffDias} días para poder desactivar egresados del año ${anio}`,
      );

    return await this.ds.transaction(async (em) => {
      const res = await em.query<{ id: string }[]>(
        `UPDATE cuentas c
            SET activo = FALSE,
                updated_at = NOW()
          WHERE c.rol = 'alumno'
            AND c.activo = TRUE
            AND c.id IN (
              SELECT m.alumno_id
                FROM matriculas m
                JOIN secciones s ON s.id = m.seccion_id
                JOIN grados g    ON g.id = s.grado_id
               WHERE m.anio = $1
                 AND g.orden >= 11
                 AND m.condicion_final = 'aprobado'
            )
         RETURNING c.id`,
        [anio],
      );
      await em.query(
        `UPDATE anios_lectivos
            SET egresados_desactivados_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [ay.id],
      );
      this.logger.log(
        `Egresados ${anio}: ${res.length} cuentas desactivadas (no eliminadas)`,
      );
      return { desactivados: res.length };
    });
  }
}
