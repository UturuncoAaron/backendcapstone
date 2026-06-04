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
  condicion_final: 'pendiente' | 'aprobado' | 'desaprobado' | 'retirado' | null;
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

export interface PeriodoFiltroRow {
  id: string;
  nombre: string;
  bimestre: number;
  fecha_inicio: string;
  fecha_fin: string;
}

export type SeccionFiltroItem = Omit<SeccionFiltroRow, 'orden'>;

@Injectable()
export class HistoricoService {
  private readonly logger = new Logger(HistoricoService.name);

  private anioIngresoExists: boolean | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) { }

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

  async findAniosDisponibles(): Promise<{ anios: number[] }> {
    try {
      const hasAnio = await this.hasAnioIngreso();
      const sql = hasAnio
        ? `SELECT DISTINCT anio FROM (
           SELECT anio_ingreso AS anio FROM alumnos WHERE anio_ingreso IS NOT NULL
           UNION SELECT anio FROM periodos  WHERE anio IS NOT NULL
           UNION SELECT anio FROM matriculas WHERE anio IS NOT NULL
         ) t ORDER BY anio DESC`
        : `SELECT DISTINCT anio FROM (
           SELECT anio FROM periodos  WHERE anio IS NOT NULL
           UNION SELECT anio FROM matriculas WHERE anio IS NOT NULL
         ) t ORDER BY anio DESC`;
      const rows = await this.dataSource.query<{ anio: number }[]>(sql);
      return { anios: rows.map((r) => Number(r.anio)) };
    } catch (err) {
      this.logger.error('findAniosDisponibles falló', err instanceof Error ? err.stack : String(err));
      throw new InternalServerErrorException('No se pudieron obtener los años del histórico');
    }
  }

  async findFiltrosPorAnio(anio: number) {
    if (!Number.isFinite(anio)) {
      throw new BadRequestException('Parámetro "anio" inválido');
    }

    try {
      const [grados, seccionesRaw, periodos] = await Promise.all([
        this.dataSource.query<GradoFiltroRow[]>(
          `
          SELECT DISTINCT g.id, g.nombre, g.orden
            FROM grados g
            JOIN secciones  s ON s.grado_id   = g.id
            JOIN matriculas m ON m.seccion_id = s.id
           WHERE m.anio = $1
           ORDER BY g.orden ASC, g.nombre ASC
          `,
          [anio],
        ),
        this.dataSource.query<SeccionFiltroRow[]>(
          `
          SELECT DISTINCT s.id, s.nombre, s.grado_id,
                          g.nombre AS grado_nombre,
                          g.orden  AS orden
            FROM secciones  s
            JOIN grados     g ON g.id         = s.grado_id
            JOIN matriculas m ON m.seccion_id = s.id
           WHERE m.anio = $1
           ORDER BY g.orden ASC, s.nombre ASC
          `,
          [anio],
        ),
        this.dataSource.query<PeriodoFiltroRow[]>(
          `
          SELECT id, nombre, bimestre, fecha_inicio, fecha_fin
            FROM periodos
           WHERE anio = $1
           ORDER BY bimestre ASC
          `,
          [anio],
        ),
      ]);

      const secciones: SeccionFiltroItem[] = seccionesRaw.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        grado_id: s.grado_id,
        grado_nombre: s.grado_nombre,
      }));

      return { grados, secciones, periodos };
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

  async findAlumnosPorAnio(opts: {
    anio: number;
    gradoId?: string;
    seccionId?: string;
    page: number;
    limit: number;
  }) {
    if (!Number.isFinite(opts.anio))
      throw new BadRequestException('Parámetro "anio" inválido');

    if (!opts.gradoId && !opts.seccionId)
      throw new BadRequestException(
        'Debes especificar grado_id o seccion_id para consultar el histórico',
      );

    const hasAnio = await this.hasAnioIngreso();
    const offset = (opts.page - 1) * opts.limit;
    const params: any[] = [opts.anio];
    const where: string[] = ['m.anio = $1'];

    if (opts.seccionId) {
      params.push(opts.seccionId);
      where.push(`s.id = $${params.length}`);
    } else if (opts.gradoId) {
      params.push(opts.gradoId);
      where.push(`g.id = $${params.length}`);
    }

    const whereSql = where.join(' AND ');

    const baseCte = `
    WITH matriculas_anio AS (
        SELECT m.alumno_id,
               m.seccion_id,
               m.anio             AS periodo_anio,
               m.condicion_final,
               s.id               AS s_id,
               s.nombre           AS s_nombre,
               g.id               AS g_id,
               g.nombre           AS g_nombre,
               g.orden            AS g_orden
          FROM matriculas m
          JOIN secciones s ON s.id = m.seccion_id
          JOIN grados    g ON g.id = s.grado_id
         WHERE ${whereSql}
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
      throw new InternalServerErrorException('No se pudo contar el histórico de alumnos');
    }

    params.push(opts.limit);
    params.push(offset);

    const anioIngresoSelect = hasAnio ? 'a.anio_ingreso' : 'NULL::int AS anio_ingreso';

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
             ma.condicion_final,
             NULL               AS periodo_id,
             NULL               AS periodo_nombre,
             NULL               AS periodo_bimestre,
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
      throw new InternalServerErrorException('No se pudo obtener el histórico de alumnos');
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