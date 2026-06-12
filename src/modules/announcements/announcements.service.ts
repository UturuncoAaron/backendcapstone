import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Announcement } from './entities/announcement.entity.js';
import { CreateAnnouncementDto } from './dto/create-announcement.dto.js';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto.js';
import {
  NOTIFICATION_EVENT_NAMES,
  AnnouncementCreatedEvent,
} from '../notifications/events/notification-events.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { StorageService } from '../storage/storage.service.js';

const DEST_VALID_PATTERNS = [
  /^todos$/,
  /^alumnos$/,
  /^padres$/,
  /^docentes$/,
  /^staff$/,
  /^psicologas$/,
  /^grado:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^seccion:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^alumno:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^padre:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
];

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectRepository(Announcement)
    private readonly repo: Repository<Announcement>,
    private readonly events: EventEmitter2,
    private readonly attachments: AttachmentsService,
    private readonly storage: StorageService,
    private readonly ds: DataSource,
  ) { }

  async validateDestinatarios(dests: string[]): Promise<void> {
    const invalid: string[] = [];
    for (const d of dests) {
      if (!DEST_VALID_PATTERNS.some(p => p.test(d))) {
        invalid.push(d);
      }
    }
    if (invalid.length > 0) {
      throw new BadRequestException(`Destinatarios inválidos: ${invalid.join(', ')}`);
    }

    for (const d of dests) {
      if (d.startsWith('grado:')) {
        const id = d.split(':')[1];
        const [row] = await this.ds.query(`SELECT 1 FROM grados WHERE id = $1`, [id]);
        if (!row) throw new NotFoundException(`Grado ${id} no encontrado`);
      } else if (d.startsWith('seccion:')) {
        const id = d.split(':')[1];
        const [row] = await this.ds.query(`SELECT 1 FROM secciones WHERE id = $1`, [id]);
        if (!row) throw new NotFoundException(`Sección ${id} no encontrada`);
      }
    }
  }

  async create(user: { id: string; rol: string }, dto: CreateAnnouncementDto) {
    let anioLectivo = dto.anio ?? null;
    if (!anioLectivo) {
      const [activo] = await this.ds.query<{ anio: number }[]>(
        `SELECT anio FROM anios_lectivos WHERE estado = 'en_curso' LIMIT 1`,
      );
      anioLectivo = activo?.anio ?? new Date().getFullYear();
    }

    const fijado = user.rol === 'admin' ? (dto.fijado ?? false) : false;
    const fijadoHasta = fijado ? (dto.fijado_hasta ?? null) : null;

    const announcement = this.repo.create({
      created_by: user.id,
      titulo: dto.titulo,
      contenido: dto.contenido,
      destinatarios: dto.destinatarios,
      importante: dto.importante ?? false,
      fijado,
      fijado_hasta: fijadoHasta ? new Date(fijadoHasta) : null,
      anio: anioLectivo,
    });
    const saved = await this.repo.save(announcement);

    this.events.emit(NOTIFICATION_EVENT_NAMES.ANNOUNCEMENT_CREATED, {
      announcementId: saved.id,
      titulo: saved.titulo,
      contenido: saved.contenido,
      destinatarios: saved.destinatarios,
      createdById: user.id,
    } satisfies AnnouncementCreatedEvent);

    return saved;
  }

  private buildVisibilidadSql(
    userId: string,
    rol: string,
    paramOffset: number,
    params: any[],
  ): string {
    if (rol === 'admin') return 'TRUE';

    const parts: string[] = [];
    parts.push(`('todos' = ANY(c.destinatarios))`);

    if (rol !== 'admin') {
      const rolPlural: Record<string, string> = {
        alumno: 'alumnos',
        docente: 'docentes',
        padre: 'padres',
        psicologa: 'psicologas',
        staff: 'staff',
      };
      const plural = rolPlural[rol];
      if (plural) parts.push(`('${plural}' = ANY(c.destinatarios))`);
    }

    if (rol === 'alumno') {
      params.push(userId);
      const p = paramOffset + params.length;
      params.push(userId);
      const p2 = paramOffset + params.length;
      parts.push(`(
        EXISTS (
          SELECT 1 FROM matriculas m
          JOIN secciones sm ON sm.id = m.seccion_id
          WHERE m.alumno_id = $${p} AND m.activo = TRUE
            AND (
              ('grado:' || sm.grado_id = ANY(c.destinatarios))
              OR ('seccion:' || m.seccion_id = ANY(c.destinatarios))
            )
        )
      )`);
      parts.push(`('alumno:' || $${p2}::text = ANY(c.destinatarios))`);
    }

    if (rol === 'padre') {
      params.push(userId);
      const p = paramOffset + params.length;
      params.push(userId);
      const p2 = paramOffset + params.length;
      parts.push(`(
        EXISTS (
          SELECT 1 FROM padre_alumno pa
          JOIN matriculas m ON m.alumno_id = pa.alumno_id AND m.activo = TRUE
          JOIN secciones sm ON sm.id = m.seccion_id
          WHERE pa.padre_id = $${p}
            AND (
              ('grado:' || sm.grado_id = ANY(c.destinatarios))
              OR ('seccion:' || m.seccion_id = ANY(c.destinatarios))
              OR ('alumno:' || pa.alumno_id = ANY(c.destinatarios))
            )
        )
      )`);
      parts.push(`('padre:' || $${p2}::text = ANY(c.destinatarios))`);
    }

    return `(${parts.join(' OR ')})`;
  }

  async findAll(query: QueryAnnouncementsDto) {
    const size = Math.min(50, Math.max(1, query.size ?? 20));
    const params: any[] = [];
    let whereExtra = '';

    const visibilidad = this.buildVisibilidadSql(query.userId!, query.rol!, params.length, params);

    if (query.cursor) {
      const d = new Date(query.cursor);
      if (isNaN(d.getTime())) throw new BadRequestException('cursor inválido');
      params.push(query.cursor);
      whereExtra += ` AND c.created_at < $${params.length}`;
    }
    if (query.anio) {
      params.push(query.anio);
      whereExtra += ` AND c.anio = $${params.length}`;
    }
    if (query.importante) {
      whereExtra += ` AND c.importante = TRUE`;
    }
    if (query.no_leidos) {
      params.push(query.userId);
      whereExtra += ` AND NOT EXISTS (
        SELECT 1 FROM comunicados_lecturas cl
        WHERE cl.comunicado_id = c.id AND cl.cuenta_id = $${params.length}
      )`;
    }
    if (query.buscar) {
      params.push(query.buscar);
      whereExtra += ` AND to_tsvector('spanish', c.titulo || ' ' || c.contenido)
        @@ plainto_tsquery('spanish', $${params.length})`;
    }

    const sql = `
      SELECT c.*,
             alec.anio AS anio_label,
             EXISTS (
               SELECT 1 FROM comunicados_lecturas cl
               WHERE cl.comunicado_id = c.id AND cl.cuenta_id = $${params.length + 1}
             ) AS leido_por_mi,
             (SELECT COUNT(*) FROM attachments a
              WHERE a.owner_type = 'announcement' AND a.owner_id = c.id) AS total_archivos,
             cu.rol AS autor_rol,
             COALESCE(adm.nombre, doc.nombre, psi.nombre, ax.nombre) AS autor_nombre,
             COALESCE(adm.apellido_paterno, doc.apellido_paterno, psi.apellido_paterno, ax.apellido_paterno) AS autor_apellido,
             adm.foto_storage_key AS autor_foto
      FROM comunicados c
      LEFT JOIN anios_lectivos alec ON alec.anio = c.anio
      INNER JOIN cuentas cu ON cu.id = c.created_by
      LEFT JOIN admins     adm ON adm.id = c.created_by
      LEFT JOIN docentes   doc ON doc.id = c.created_by
      LEFT JOIN psicologas psi ON psi.id = c.created_by
      LEFT JOIN staff      ax  ON ax.id  = c.created_by
      WHERE c.activo = TRUE
        AND ${visibilidad}
        ${whereExtra}
      ORDER BY
        CASE WHEN c.fijado = TRUE
              AND (c.fijado_hasta IS NULL OR c.fijado_hasta > NOW())
              THEN 0 ELSE 1 END,
        c.created_at DESC
      LIMIT $${params.length + 2}
    `;

    params.push(query.userId, size);

    const rows = await this.repo.query(sql, params);
    const hasNext = rows.length > size;
    if (hasNext) rows.pop();

    const ids = rows.map((r: any) => r.id);
    const attachmentsMap = await this.attachments.listByOwnersBulk('announcement', ids);

    const totalFijados = await this.countFijados(query);
    const totalNoLeidos = await this.countNoLeidos(query);

    const data = rows.map((r: any) => ({
      id: r.id,
      titulo: r.titulo,
      contenido_preview: (r.contenido ?? '').replace(/<[^>]*>/g, '').substring(0, 200),
      contenido_completo: null,
      importante: r.importante,
      fijado: r.fijado,
      fijado_hasta: r.fijado_hasta,
      destinatarios: r.destinatarios,
      activo: r.activo,
      vistas: r.vistas,
      leido_por_mi: r.leido_por_mi,
      anio: r.anio,
      anio_label: r.anio_label ? String(r.anio_label) : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      creado_por: {
        id: r.created_by,
        nombre_completo: r.autor_nombre && r.autor_apellido
          ? `${r.autor_nombre} ${r.autor_apellido}` : 'Desconocido',
        rol: r.autor_rol,
        foto_url: r.autor_foto ? this.storage.getPublicUrl(r.autor_foto) : null,
      },
      archivos: (attachmentsMap.get(r.id) ?? []).map((a: any) => ({
        id: a.id,
        original_name: a.original_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        url: a.download_url,
      })),
      total_archivos: Number(r.total_archivos ?? 0),
    }));

    return {
      data,
      size,
      has_next: hasNext,
      next_cursor: rows.length > 0 ? rows[rows.length - 1].created_at : null,
      total_fijados: totalFijados,
      total_no_leidos: totalNoLeidos,
    };
  }

  private async countFijados(query: QueryAnnouncementsDto): Promise<number> {
    const params: any[] = [];
    const vis = this.buildVisibilidadSql(query.userId!, query.rol!, params.length, params);
    const sql = `
      SELECT COUNT(*)::int FROM comunicados c
      WHERE c.activo = TRUE
        AND c.fijado = TRUE
        AND (c.fijado_hasta IS NULL OR c.fijado_hasta > NOW())
        AND ${vis}
    `;
    const [r] = await this.repo.query(sql, params);
    return r?.count ?? 0;
  }

  private async countNoLeidos(query: QueryAnnouncementsDto): Promise<number> {
    const params: any[] = [];
    const vis = this.buildVisibilidadSql(query.userId!, query.rol!, params.length, params);
    params.push(query.userId);
    const sql = `
      SELECT COUNT(*)::int FROM comunicados c
      WHERE c.activo = TRUE
        AND ${vis}
        AND NOT EXISTS (
          SELECT 1 FROM comunicados_lecturas cl
          WHERE cl.comunicado_id = c.id AND cl.cuenta_id = $${params.length}
        )
    `;
    const [r] = await this.repo.query(sql, params);
    return r?.count ?? 0;
  }

  async findOne(id: string, userId?: string) {
    const sql = `
      SELECT c.*,
             alec.anio AS anio_label,
             (SELECT COUNT(*) FROM attachments a
              WHERE a.owner_type = 'announcement' AND a.owner_id = c.id) AS total_archivos,
             cu.rol AS autor_rol,
             COALESCE(adm.nombre, doc.nombre, psi.nombre, ax.nombre) AS autor_nombre,
             COALESCE(adm.apellido_paterno, doc.apellido_paterno, psi.apellido_paterno, ax.apellido_paterno) AS autor_apellido,
             adm.foto_storage_key AS autor_foto,
             (SELECT COUNT(*) FROM comunicados_lecturas cl
              WHERE cl.comunicado_id = c.id) AS lecturas_total
      FROM comunicados c
      LEFT JOIN anios_lectivos alec ON alec.anio = c.anio
      INNER JOIN cuentas cu ON cu.id = c.created_by
      LEFT JOIN admins     adm ON adm.id = c.created_by
      LEFT JOIN docentes   doc ON doc.id = c.created_by
      LEFT JOIN psicologas psi ON psi.id = c.created_by
      LEFT JOIN staff      ax  ON ax.id  = c.created_by
      WHERE c.id = $1
    `;
    const rows = await this.repo.query(sql, [id]);
    if (!rows.length) throw new NotFoundException(`Comunicado ${id} no encontrado`);

    const r = rows[0];
    const archivos = await this.attachments.listByOwner('announcement', id);

    if (userId) {
      await this.ds.query(
        `INSERT INTO comunicados_lecturas (comunicado_id, cuenta_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, userId],
      );
      await this.ds.query(`UPDATE comunicados SET vistas = vistas + 1 WHERE id = $1`, [id]);
    }

    return {
      id: r.id,
      titulo: r.titulo,
      contenido_preview: (r.contenido ?? '').replace(/<[^>]*>/g, '').substring(0, 200),
      contenido_completo: r.contenido,
      important: r.importante,
      fijado: r.fijado,
      fijado_hasta: r.fijado_hasta,
      destinatarios: r.destinatarios,
      activo: r.activo,
      vistas: Number(r.vistas) + (userId ? 1 : 0),
      anio: r.anio,
      anio_label: r.anio_label ? String(r.anio_label) : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      creado_por: {
        id: r.created_by,
        nombre_completo: r.autor_nombre && r.autor_apellido
          ? `${r.autor_nombre} ${r.autor_apellido}` : 'Desconocido',
        rol: r.autor_rol,
        foto_url: r.autor_foto ? this.storage.getPublicUrl(r.autor_foto) : null,
      },
      archivos: archivos.map((a: any) => ({
        id: a.id,
        original_name: a.original_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        url: a.download_url,
      })),
      total_archivos: Number(r.total_archivos ?? 0),
      lecturas_total: Number(r.lecturas_total ?? 0),
    };
  }

  async update(
    id: string, userId: string, rol: string,
    dto: Partial<{
      titulo: string; contenido: string; destinatarios: string[];
      importante: boolean; fijado: boolean; fijado_hasta: string;
      activo: boolean;
    }>,
  ) {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Comunicado ${id} no encontrado`);

    if (rol !== 'admin' && a.created_by !== userId) {
      throw new ForbiddenException('Solo el creador o admin pueden editar');
    }

    if (dto.titulo !== undefined) a.titulo = dto.titulo;
    if (dto.contenido !== undefined) a.contenido = dto.contenido;
    if (dto.destinatarios !== undefined) a.destinatarios = dto.destinatarios;
    if (dto.importante !== undefined) a.importante = dto.importante;

    if (rol === 'admin') {
      if (dto.fijado !== undefined) a.fijado = dto.fijado;
      if (dto.fijado_hasta !== undefined) a.fijado_hasta = dto.fijado_hasta ? new Date(dto.fijado_hasta) : null;
      if (dto.activo !== undefined) a.activo = dto.activo;
    }

    return this.repo.save(a);
  }

  async fijar(id: string, fijado: boolean, fijado_hasta?: string) {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Comunicado ${id} no encontrado`);
    a.fijado = fijado;
    a.fijado_hasta = fijado_hasta ? new Date(fijado_hasta) : null;
    return this.repo.save(a);
  }

  async archivar(id: string, userId: string, rol: string) {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Comunicado ${id} no encontrado`);
    if (rol !== 'admin' && a.created_by !== userId) {
      throw new ForbiddenException('Solo el creador o admin pueden archivar');
    }
    a.activo = false;
    return this.repo.save(a);
  }

  async getLecturas(id: string) {
    const rows = await this.ds.query(
      `SELECT cl.cuenta_id, cu.rol,
              COALESCE(adm.nombre, doc.nombre, psi.nombre, ax.nombre, al.nombre, pa.nombre) AS nombre,
              COALESCE(adm.apellido_paterno, doc.apellido_paterno, psi.apellido_paterno, ax.apellido_paterno, al.apellido_paterno, pa.apellido_paterno) AS apellido,
              cl.leido_en
       FROM comunicados_lecturas cl
       JOIN cuentas cu ON cu.id = cl.cuenta_id
       LEFT JOIN admins     adm ON adm.id = cl.cuenta_id
       LEFT JOIN docentes   doc ON doc.id = cl.cuenta_id
       LEFT JOIN psicologas psi ON psi.id = cl.cuenta_id
       LEFT JOIN staff      ax  ON ax.id  = cl.cuenta_id
       LEFT JOIN alumnos    al  ON al.id  = cl.cuenta_id
       LEFT JOIN padres     pa  ON pa.id  = cl.cuenta_id
       WHERE cl.comunicado_id = $1
       ORDER BY cl.leido_en DESC`,
      [id],
    );
    return rows.map((r: any) => ({
      cuenta_id: r.cuenta_id,
      nombre_completo: r.nombre && r.apellido
        ? `${r.nombre} ${r.apellido}` : 'Desconocido',
      rol: r.rol,
      leido_en: r.leido_en,
    }));
  }

  async findAllAdmin(query: {
    size?: number; cursor?: string; anio?: number;
    activo?: boolean; orden?: string; buscar?: string;
  }) {
    const size = Math.min(50, Math.max(1, query.size ?? 20));
    const params: any[] = [];
    let whereExtra = '';

    if (query.cursor) {
      params.push(query.cursor);
      whereExtra += ` AND c.created_at < $${params.length}`;
    }
    if (query.anio) {
      params.push(query.anio);
      whereExtra += ` AND c.anio = $${params.length}`;
    }
    if (query.activo !== undefined && query.activo !== null) {
      params.push(query.activo);
      whereExtra += ` AND c.activo = $${params.length}`;
    }
    if (query.buscar) {
      params.push(query.buscar);
      whereExtra += ` AND to_tsvector('spanish', c.titulo || ' ' || c.contenido)
        @@ plainto_tsquery('spanish', $${params.length})`;
    }

    let orderClause = 'c.created_at DESC';
    if (query.orden === 'vistas_desc') orderClause = 'c.vistas DESC';
    else if (query.orden === 'no_leidos_desc') {
      orderClause = `(SELECT COUNT(*) FROM comunicados_lecturas cl WHERE cl.comunicado_id = c.id) ASC`;
    }

    const sql = `
      SELECT c.*,
             alec.anio AS anio_label,
             (SELECT COUNT(*) FROM attachments a
              WHERE a.owner_type = 'announcement' AND a.owner_id = c.id) AS total_archivos,
             cu.rol AS autor_rol,
             COALESCE(adm.nombre, doc.nombre, psi.nombre, ax.nombre) AS autor_nombre,
             COALESCE(adm.apellido_paterno, doc.apellido_paterno, psi.apellido_paterno, ax.apellido_paterno) AS autor_apellido,
             (SELECT COUNT(*) FROM comunicados_lecturas cl
              WHERE cl.comunicado_id = c.id) AS lecturas_total
      FROM comunicados c
      LEFT JOIN anios_lectivos alec ON alec.anio = c.anio
      INNER JOIN cuentas cu ON cu.id = c.created_by
      LEFT JOIN admins     adm ON adm.id = c.created_by
      LEFT JOIN docentes   doc ON doc.id = c.created_by
      LEFT JOIN psicologas psi ON psi.id = c.created_by
      LEFT JOIN staff      ax  ON ax.id  = c.created_by
      WHERE 1=1 ${whereExtra}
      ORDER BY ${orderClause}
      LIMIT $${params.length + 1}
    `;

    params.push(size);
    const rows = await this.repo.query(sql, params);
    const hasNext = rows.length > size;
    if (hasNext) rows.pop();

    const ids = rows.map((r: any) => r.id);
    const attachmentsMap = await this.attachments.listByOwnersBulk('announcement', ids);

    const data = rows.map((r: any) => ({
      id: r.id,
      titulo: r.titulo,
      contenido_preview: (r.contenido ?? '').replace(/<[^>]*>/g, '').substring(0, 200),
      contenido_completo: null,
      importante: r.importante,
      fijado: r.fijado,
      fijado_hasta: r.fijado_hasta,
      destinatarios: r.destinatarios,
      destinatarios_resueltos: (r.destinatarios ?? []).map((d: string) => d),
      activo: r.activo,
      vistas: r.vistas,
      lecturas_total: Number(r.lecturas_total ?? 0),
      anio: r.anio,
      anio_label: r.anio_label ? String(r.anio_label) : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      creado_por: {
        id: r.created_by,
        nombre_completo: r.autor_nombre && r.autor_apellido
          ? `${r.autor_nombre} ${r.autor_apellido}` : 'Desconocido',
        rol: r.autor_rol,
      },
      archivos: (attachmentsMap.get(r.id) ?? []).map((a: any) => ({
        id: a.id,
        original_name: a.original_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
      })),
      total_archivos: Number(r.total_archivos ?? 0),
    }));

    return {
      data,
      size,
      has_next: hasNext,
      next_cursor: rows.length > 0 ? rows[rows.length - 1].created_at : null,
    };
  }

  async deleteArchivo(comunicadoId: string, archivoId: string, userId: string, rol: string) {
    const a = await this.repo.findOne({ where: { id: comunicadoId } });
    if (!a) throw new NotFoundException(`Comunicado ${comunicadoId} no encontrado`);
    if (rol !== 'admin' && a.created_by !== userId) {
      throw new ForbiddenException('Solo el creador o admin pueden eliminar archivos');
    }
    await this.attachments.remove(archivoId, userId, rol);
    return { message: 'Archivo eliminado' };
  }
}