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

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    private readonly events: EventEmitter2,
    private readonly attachments: AttachmentsService,
  ) {}

  async create(adminId: string, dto: CreateAnnouncementDto) {
    const announcement = this.announcementRepo.create({
      admin_id: adminId,
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
      createdById: adminId,
    } satisfies AnnouncementCreatedEvent);

    return saved;
  }

  async findAll(query: QueryAnnouncementsDto) {
    const qb = this.announcementRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.admin', 'admin')
      .select([
        'a.id',
        'a.titulo',
        'a.contenido',
        'a.destinatarios',
        'a.activo',
        'a.created_at',
        'admin.id',
        'admin.nombre',
        'admin.apellido_paterno',
      ])
      .where('a.activo = true')
      .orderBy('a.created_at', 'DESC');

    if (query.rol) {
      qb.andWhere(
        ":rol = ANY(a.destinatarios) OR 'todos' = ANY(a.destinatarios)",
        { rol: query.rol },
      );
    }

    const rows = await qb.getMany();
    const map = await this.attachments.listByOwnersBulk('announcement', rows.map(r => r.id));
    return rows.map(r => ({ ...r, attachments: map.get(r.id) ?? [] }));
  }

  async findOne(id: string) {
    const announcement = await this.announcementRepo.findOne({
      where: { id },
      relations: ['admin'],
    });
    if (!announcement)
      throw new NotFoundException(`Comunicado ${id} no encontrado`);
    const attachments = await this.attachments.listByOwner('announcement', id);
    return { ...announcement, attachments };
  }

  async remove(id: string) {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement)
      throw new NotFoundException(`Comunicado ${id} no encontrado`);
    announcement.activo = false;
    await this.announcementRepo.save(announcement);
    return { message: 'Comunicado desactivado correctamente' };
  }
}
