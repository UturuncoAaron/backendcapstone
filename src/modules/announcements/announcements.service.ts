import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Announcement } from './entities/announcement.entity.js';
import { CreateAnnouncementDto } from './dto/create-announcement.dto.js';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto.js';
import {
  NOTIFICATION_EVENT_NAMES,
  AnnouncementCreatedEvent,
} from '../notifications/events/notification-events.js';
import { AttachmentsService } from '../attachments/attachments.service.js';

// Mapeo rol JWT → valor en el array destinatarios de la BD
const ROL_A_DESTINATARIO: Record<string, string> = {
  alumno: 'alumnos',
  docente: 'docentes',
  padre: 'padres',
  psicologa: 'psicologas',
  admin: 'todos',
};

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    private readonly events: EventEmitter2,
    private readonly attachments: AttachmentsService,
  ) { }

  // ══════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ══════════════════════════════════════════════════════════════

  /**
   * Fragmento SQL reutilizable para obtener el nombre del autor.
   * El COALESCE recorre las tablas especializadas en orden —
   * si mañana se agrega un nuevo rol que puede crear comunicados,
   * solo se añade un LEFT JOIN y un COALESCE más aquí.
   */
  private get autorJoins(): string {
    return `
      INNER JOIN cuentas    c   ON c.id  = a.created_by
      LEFT  JOIN admins     adm ON adm.id = a.created_by
      LEFT  JOIN psicologas psi ON psi.id = a.created_by
      LEFT  JOIN docentes   doc ON doc.id = a.created_by
      LEFT  JOIN auxiliares aux ON aux.id = a.created_by
    `;
  }

  private get autorSelect(): string {
    return `
      c.id  AS autor_id,
      c.rol AS autor_rol,
      COALESCE(adm.nombre,           psi.nombre,           doc.nombre,           aux.nombre)           AS autor_nombre,
      COALESCE(adm.apellido_paterno, psi.apellido_paterno, doc.apellido_paterno, aux.apellido_paterno) AS autor_apellido
    `;
  }

  private mapAutor(r: any) {
    return r.autor_id
      ? {
        id: r.autor_id,
        rol: r.autor_rol,
        nombre: r.autor_nombre ?? '',
        apellido_paterno: r.autor_apellido ?? '',
      }
      : null;
  }

  private mapRow(r: any, attachments: any[] = []) {
    return {
      id: r.id,
      titulo: r.titulo,
      contenido: r.contenido,
      destinatarios: r.destinatarios,
      activo: r.activo,
      created_at: r.created_at,
      autor: this.mapAutor(r),
      attachments,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // CREATE
  // ══════════════════════════════════════════════════════════════

  async create(createdById: string, dto: CreateAnnouncementDto) {
    const announcement = this.announcementRepo.create({
      created_by: createdById,
      titulo: dto.titulo,
      contenido: dto.contenido,
      destinatarios: dto.destinatarios ?? ['todos'],
    });
    const saved = await this.announcementRepo.save(announcement);

    this.events.emit(NOTIFICATION_EVENT_NAMES.ANNOUNCEMENT_CREATED, {
      announcementId: saved.id,
      titulo: saved.titulo,
      contenido: saved.contenido,
      destinatarios: saved.destinatarios,
      createdById,
    } satisfies AnnouncementCreatedEvent);

    return saved;
  }

  // ══════════════════════════════════════════════════════════════
  // FIND ALL
  // ══════════════════════════════════════════════════════════════

  async findAll(query: QueryAnnouncementsDto) {
    const dest = query.rol
      ? (ROL_A_DESTINATARIO[query.rol] ?? query.rol)
      : null;

    const params: any[] = [];
    let whereExtra = '';

    if (dest) {
      params.push(dest);
      whereExtra = `AND ($${params.length} = ANY(a.destinatarios) OR 'todos' = ANY(a.destinatarios))`;
    }

    const sql = `
      SELECT
        a.id, a.titulo, a.contenido, a.destinatarios,
        a.activo, a.created_at,
        ${this.autorSelect}
      FROM comunicados a
      ${this.autorJoins}
      WHERE a.activo = true
      ${whereExtra}
      ORDER BY a.created_at DESC
    `;

    const rows = await this.announcementRepo.query(sql, params);

    const attachmentsMap = await this.attachments.listByOwnersBulk(
      'announcement',
      rows.map((r: any) => r.id),
    );

    return rows.map((r: any) =>
      this.mapRow(r, attachmentsMap.get(r.id) ?? [])
    );
  }

  // ══════════════════════════════════════════════════════════════
  // FIND ONE
  // ══════════════════════════════════════════════════════════════

  async findOne(id: string) {
    const sql = `
      SELECT
        a.id, a.titulo, a.contenido, a.destinatarios,
        a.activo, a.created_at,
        ${this.autorSelect}
      FROM comunicados a
      ${this.autorJoins}
      WHERE a.id = $1
    `;

    const rows = await this.announcementRepo.query(sql, [id]);

    if (!rows.length)
      throw new NotFoundException(`Comunicado ${id} no encontrado`);

    const attachments = await this.attachments.listByOwner('announcement', id);
    return this.mapRow(rows[0], attachments);
  }

  // ══════════════════════════════════════════════════════════════
  // REMOVE (soft delete)
  // ══════════════════════════════════════════════════════════════

  async remove(id: string) {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement)
      throw new NotFoundException(`Comunicado ${id} no encontrado`);
    announcement.activo = false;
    await this.announcementRepo.save(announcement);
    return { message: 'Comunicado desactivado correctamente' };
  }
}