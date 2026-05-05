import {
    Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LiveClass, EstadoClase } from './entities/live-class.entity.js';

@Injectable()
export class LiveClassesService {
    private readonly logger = new Logger(LiveClassesService.name);

    constructor(
        @InjectRepository(LiveClass)
        private readonly liveClassRepo: Repository<LiveClass>,
    ) { }

    async findByCourse(cursoId: string) {
        return this.liveClassRepo.find({
            where: { curso_id: cursoId },
            order: { fecha_hora: 'DESC' },
        });
    }

    async findAll() {
        return this.liveClassRepo.find({
            relations: ['curso'],
            order: { fecha_hora: 'DESC' },
        });
    }

    async findOne(id: string) {
        const clase = await this.liveClassRepo.findOne({
            where: { id },
            relations: ['curso'],
        });
        if (!clase) throw new NotFoundException(`Clase ${id} no encontrada`);
        return clase;
    }

    async create(dto: {
        curso_id: string;
        titulo: string;
        descripcion?: string;
        fecha_hora: Date;
        duracion_min?: number;
        link_reunion: string;
    }) {
        const clase = this.liveClassRepo.create({
            ...dto,
            descripcion: dto.descripcion ?? null,
            duracion_min: dto.duracion_min ?? 60,
            estado: 'programada',
        });
        this.logger.log(`Clase creada: ${dto.titulo}`);
        return this.liveClassRepo.save(clase);
    }

    async updateEstado(id: string, estado: EstadoClase, userId: string, rol: string) {
        const clase = await this.findOne(id);

        if (rol === 'docente' && clase.curso.docente_id !== userId) {
            throw new ForbiddenException('No tienes permiso para modificar esta clase');
        }

        clase.estado = estado;
        this.logger.log(`Clase ${id} → estado: ${estado}`);
        return this.liveClassRepo.save(clase);
    }

    async update(id: string, dto: Partial<{
        titulo: string;
        descripcion: string;
        fecha_hora: Date;
        duracion_min: number;
        link_reunion: string;
    }>, userId: string, rol: string) {
        const clase = await this.findOne(id);

        if (rol === 'docente' && clase.curso.docente_id !== userId) {
            throw new ForbiddenException('No tienes permiso para modificar esta clase');
        }

        Object.assign(clase, dto);
        return this.liveClassRepo.save(clase);
    }

    async remove(id: string, userId: string, rol: string) {
        const clase = await this.findOne(id);

        if (rol === 'docente' && clase.curso.docente_id !== userId) {
            throw new ForbiddenException('No tienes permiso para eliminar esta clase');
        }

        await this.liveClassRepo.remove(clase);
        return { message: 'Clase eliminada correctamente' };
    }
}