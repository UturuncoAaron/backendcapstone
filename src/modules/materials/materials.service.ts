import {
    Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material } from './entities/material.entity.js';

@Injectable()
export class MaterialsService {
    constructor(
        @InjectRepository(Material)
        private readonly materialRepo: Repository<Material>,
    ) { }

    async findByCourse(courseId: string) {
        return this.materialRepo.find({
            where: { curso_id: courseId, activo: true },
            order: { orden: 'ASC', created_at: 'DESC' },
        });
    }

    async findOne(id: string) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);
        return material;
    }

    async create(dto: {
        curso_id: string;
        titulo: string;
        tipo: string;
        url: string;
        descripcion?: string;
        orden?: number;
    }) {
        const material = this.materialRepo.create(dto as any);
        return this.materialRepo.save(material);
    }

    async update(id: string, docenteId: string, rol: string, dto: Partial<{
        titulo: string;
        descripcion: string;
        orden: number;
        activo: boolean;
    }>) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
            relations: ['curso'],
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);

        if (rol === 'docente' && material.curso.docente_id !== docenteId) {
            throw new ForbiddenException('No tienes permiso para editar este material');
        }

        Object.assign(material, dto);
        return this.materialRepo.save(material);
    }

    async remove(id: string, docenteId: string, rol: string) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
            relations: ['curso'],
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);

        if (rol === 'docente' && material.curso.docente_id !== docenteId) {
            throw new ForbiddenException('No tienes permiso para eliminar este material');
        }

        material.activo = false;
        await this.materialRepo.save(material);
        return { message: 'Material eliminado correctamente' };
    }
}