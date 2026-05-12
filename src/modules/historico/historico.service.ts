// Ubicación: src/modules/historico/historico.service.ts
//
// Servicio que consulta el histórico de alumnos reutilizando el
// esquema existente. NO crea tablas nuevas: apunta directo a
// alumnos + matriculas + secciones + grados + periodos.
//
// Índices que aprovecha (ya presentes en la BD según CHANGELOG_DB.md):
//   - idx_alumnos_anio_ingreso       (alumnos.anio_ingreso)
//   - idx_matriculas_historico       (matriculas.alumno_id, periodo_id DESC)
//   - idx_matriculas_seccion         (matriculas.seccion_id, periodo_id) WHERE activo
//   - idx_periodos_anio              (periodos.anio, bimestre)

import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { StorageService } from '../storage/storage.service.js';

interface AlumnoHistoricoRow {
  id: string;
  codigo_estudiante: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  inclusivo: boolean | null;
  foto_storage_key: string | null;
  numero_documento: string | null;
  tipo_documento: string | null;
  anio_ingreso: number | null;
  grado_id: string | null;
  grado: string | null;
  seccion_id: string | null;
  seccion: string | null;
  periodo_id: string | null;
  periodo_nombre: string | null;
  periodo_bimestre: number | null;
  periodo_anio: number | null;
}

export interface GradoFiltroRow {
  id: string;
  nombre: string;
  orden: number;
}

export interface SeccionFiltroRow {
  id: string;
  nombre: string;
  grado_id: string;
  grado_nombre: string;
  orden: number;
}

export type SeccionFiltroItem = Omit<SeccionFiltroRow, 'orden'>;

@Injectable()
export class HistoricoService {
  private readonly logger = new Logger(HistoricoService.name);
  /**
   * Algunos entornos pueden no tener todavía `alumnos.anio_ingreso`.
   * Detectamos su existencia bajo demanda para que los endpoints
   * sigan funcionando aunque la columna falte (devolveremos `null`).
   */
  private anioIngresoExists: boolean | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  private async hasAnioIngreso(): Promise<boolean> {
    if (this.anioIngresoExists !== null) return this.anioIngresoExists;
    const rows = await this.dataSource.query<{ exists: boolean }[]>(`
            SELECT EXISTS (
                SELECT 1
                  FROM information_schema.columns
                 WHERE table_name = 'alumnos'
                   AND column_name = 'anio_ingreso'
            ) AS exists
        `);
    this.anioIngresoExists = !!rows[0]?.exists;
    if (!this.anioIngresoExists) {
      this.logger.warn(
        'La columna alumnos.anio_ingreso no existe — el histórico ' +
          'usará sólo periodos.anio y devolverá anio_ingreso=null.',
      );
    }
    return this.anioIngresoExists;
  }

  // ─────────────────────────────────────────────────────────────
  // Años disponibles: unión de alumnos.anio_ingreso y periodos.anio
  // ─────────────────────────────────────────────────────────────
  async findAniosDisponibles(): Promise<{ anios: number[] }> {
    try {
      const hasAnio = await this.hasAnioIngreso();
      const sql = hasAnio
        ? `
                    SELECT DISTINCT anio FROM (
                        SELECT anio_ingreso AS anio
                          FROM alumnos
                         WHERE anio_ingreso IS NOT NULL
                        UNION
                        SELECT anio FROM periodos WHERE anio IS NOT NULL
                    ) t
                    ORDER BY anio DESC
                `
        : `
                    SELECT DISTINCT anio FROM periodos
                     WHERE anio IS NOT NULL
                     ORDER BY anio DESC
                `;
      const rows = await this.dataSource.query<{ anio: number }[]>(sql);
      return { anios: rows.map((r) => Number(r.anio)) };
    } catch (err) {
      this.logger.error(
        'findAniosDisponibles falló',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'No se pudieron obtener los años del histórico',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Filtros (grados y secciones) disponibles para un año
  // ─────────────────────────────────────────────────────────────
  async findFiltrosPorAnio(anio: number) {
    if (!Number.isFinite(anio)) {
      throw new BadRequestException('Parámetro "anio" inválido');
    }

    try {
      const grados = await this.dataSource.query<GradoFiltroRow[]>(
        `
                SELECT DISTINCT g.id, g.nombre, g.orden
                  FROM grados g
                  JOIN secciones  s ON s.grado_id   = g.id
                  JOIN matriculas m ON m.seccion_id = s.id
                  JOIN periodos   p ON p.id         = m.periodo_id
                 WHERE p.anio = $1
                 ORDER BY g.orden ASC, g.nombre ASC
            `,
        [anio],
      );

      // Postgres exige que toda columna del ORDER BY aparezca en
      // la lista de SELECT cuando se usa DISTINCT. Incluimos
      // g.orden en el SELECT y luego lo descartamos del payload
      // que devolvemos al cliente.
      const seccionesRaw = await this.dataSource.query<SeccionFiltroRow[]>(
        `
                SELECT DISTINCT s.id, s.nombre, s.grado_id,
                                g.nombre AS grado_nombre,
                                g.orden  AS orden
                  FROM secciones  s
                  JOIN grados     g ON g.id         = s.grado_id
                  JOIN matriculas m ON m.seccion_id = s.id
                  JOIN periodos   p ON p.id         = m.periodo_id
                 WHERE p.anio = $1
                 ORDER BY g.orden ASC, s.nombre ASC
            `,
        [anio],
      );

      const secciones: SeccionFiltroItem[] = seccionesRaw.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        grado_id: s.grado_id,
        grado_nombre: s.grado_nombre,
      }));
      return { grados, secciones };
    } catch (err) {
      this.logger.error(
        `findFiltrosPorAnio(${anio}) falló`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'No se pudieron obtener los filtros del histórico',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Listado paginado de alumnos por año (con datos de matrícula)
  //
  // Estrategia: tomamos los alumnos que tengan matrícula en algún
  // período del año solicitado. Si un alumno tuvo varias matrículas
  // ese año (varios bimestres) usamos la más reciente (mayor bimestre).
  // ─────────────────────────────────────────────────────────────
  async findAlumnosPorAnio(opts: {
    anio: number;
    gradoId?: string;
    seccionId?: string;
    page: number;
    limit: number;
  }) {
    if (!Number.isFinite(opts.anio)) {
      throw new BadRequestException('Parámetro "anio" inválido');
    }

    // Defensa en profundidad: para mantener la escalabilidad nunca
    // queremos que un cliente "barra" todos los alumnos del año.
    // Exigimos que se haya elegido al menos grado o sección. La UI
    // del histórico no permite consultar sin sección, este check
    // existe por si alguien llama el endpoint directo.
    if (!opts.gradoId && !opts.seccionId) {
      throw new BadRequestException(
        'Debes especificar grado_id o seccion_id para consultar el histórico',
      );
    }

    const hasAnio = await this.hasAnioIngreso();
    const offset = (opts.page - 1) * opts.limit;
    const params: any[] = [opts.anio];
    const where: string[] = ['p.anio = $1'];

    if (opts.seccionId) {
      params.push(opts.seccionId);
      where.push(`s.id = $${params.length}`);
    } else if (opts.gradoId) {
      params.push(opts.gradoId);
      where.push(`g.id = $${params.length}`);
    }

    const whereSql = where.join(' AND ');

    // CTE: por cada alumno del año, su matrícula más reciente
    // (bimestre más alto). Usa idx_matriculas_historico.
    const baseCte = `
            WITH matriculas_anio AS (
                SELECT DISTINCT ON (m.alumno_id)
                       m.alumno_id,
                       m.seccion_id,
                       m.periodo_id,
                       p.anio        AS periodo_anio,
                       p.bimestre    AS periodo_bimestre,
                       p.nombre      AS periodo_nombre,
                       s.id          AS s_id,
                       s.nombre      AS s_nombre,
                       g.id          AS g_id,
                       g.nombre      AS g_nombre,
                       g.orden       AS g_orden
                  FROM matriculas m
                  JOIN periodos  p ON p.id = m.periodo_id
                  JOIN secciones s ON s.id = m.seccion_id
                  JOIN grados    g ON g.id = s.grado_id
                 WHERE ${whereSql}
                 ORDER BY m.alumno_id, p.bimestre DESC
            )
        `;

    let total = 0;
    try {
      const totalRows = await this.dataSource.query<{ count: string }[]>(
        `${baseCte} SELECT COUNT(*)::int AS count FROM matriculas_anio`,
        params,
      );
      total = Number(totalRows[0]?.count ?? 0);
    } catch (err) {
      this.logger.error(
        `findAlumnosPorAnio.count(${JSON.stringify(opts)}) falló`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'No se pudo contar el histórico de alumnos',
      );
    }

    params.push(opts.limit);
    params.push(offset);

    const anioIngresoSelect = hasAnio
      ? 'a.anio_ingreso'
      : 'NULL::int AS anio_ingreso';

    let rows: AlumnoHistoricoRow[] = [];
    try {
      rows = await this.dataSource.query<AlumnoHistoricoRow[]>(
        `
            ${baseCte}
            SELECT a.id,
                   a.codigo_estudiante,
                   a.nombre,
                   a.apellido_paterno,
                   a.apellido_materno,
                   a.inclusivo,
                   a.foto_storage_key,
                   ${anioIngresoSelect},
                   c.numero_documento,
                   c.tipo_documento,
                   ma.g_id            AS grado_id,
                   ma.g_nombre        AS grado,
                   ma.s_id            AS seccion_id,
                   ma.s_nombre        AS seccion,
                   ma.periodo_id      AS periodo_id,
                   ma.periodo_nombre  AS periodo_nombre,
                   ma.periodo_bimestre AS periodo_bimestre,
                   ma.periodo_anio    AS periodo_anio
              FROM matriculas_anio ma
              JOIN alumnos a ON a.id = ma.alumno_id
              JOIN cuentas c ON c.id = a.id
             ORDER BY ma.g_orden ASC, ma.s_nombre ASC,
                      a.apellido_paterno ASC, a.nombre ASC
             LIMIT $${params.length - 1} OFFSET $${params.length}
            `,
        params,
      );
    } catch (err) {
      this.logger.error(
        `findAlumnosPorAnio.rows(${JSON.stringify(opts)}) falló`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'No se pudo obtener el histórico de alumnos',
      );
    }

    const data = rows.map((r) => ({
      ...r,
      foto_url: r.foto_storage_key
        ? this.storage.getPublicUrl(r.foto_storage_key)
        : null,
    }));

    return {
      data,
      total,
      page: opts.page,
      limit: opts.limit,
      totalPages: Math.ceil(total / opts.limit),
    };
  }
}
