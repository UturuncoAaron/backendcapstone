import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement } from './entities/announcement.entity.js';
import { CreateAnnouncementDto } from './dto/create-announcement.dto.js';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto.js';

@Injectable()
export class AnnouncementsService {
    constructor(
        @InjectRepository(Announcement)
        private readonly announcementRepo: Repository<Announcement>,
    ) { }

    async create(adminId: string, dto: CreateAnnouncementDto) {
        const announcement = this.announcementRepo.create({
            admin_id: adminId,
            titulo: dto.titulo,
            contenido: dto.contenido,
            destinatario: dto.destinatario ?? 'todos',
        });
        return this.announcementRepo.save(announcement);
    }

    async findAll(query: QueryAnnouncementsDto) {
        const qb = this.announcementRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.admin', 'admin')
            .select([
                'a.id',
                'a.titulo',
                'a.contenido',
                'a.destinatario',
                'a.activo',
                'a.created_at',
                'admin.id',
                'admin.nombre',
                'admin.apellido_paterno',
            ])
            .orderBy('a.created_at', 'DESC');

        if (query.destinatario) {
            qb.andWhere('a.destinatario = :dest', { dest: query.destinatario });
        }
        if (query.activo !== undefined) {
            qb.andWhere('a.activo = :activo', { activo: query.activo === 'true' });
        }

        return qb.getMany();
    }

    async findOne(id: string) {
        const announcement = await this.announcementRepo.findOne({
            where: { id },
            relations: ['admin'],
        });
        if (!announcement) throw new NotFoundException(`Comunicado ${id} no encontrado`);
        return announcement;
    }

    async remove(id: string) {
        const announcement = await this.findOne(id);
        announcement.activo = false;
        await this.announcementRepo.save(announcement);
        return { message: 'Comunicado desactivado correctamente' };
    }
}