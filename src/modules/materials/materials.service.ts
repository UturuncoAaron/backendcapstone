import {
    Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material, TipoMaterial } from './entities/material.entity.js';
import { StorageService } from '../storage/storage.service.js';

@Injectable()
export class MaterialsService {
    constructor(
        @InjectRepository(Material)
        private readonly materialRepo: Repository<Material>,
        private readonly storageService: StorageService,
    ) { }

    async findByCourse(courseId: string) {
        const materials = await this.materialRepo.find({
            where: { curso_id: courseId, activo: true },
            order: { orden: 'ASC', created_at: 'DESC' },
        });

        // Generar URLs firmadas para PDFs e imágenes
        return Promise.all(materials.map(async (m) => {
            if ((m.tipo === 'pdf' || m.tipo === 'otro') && !m.url.startsWith('http')) {
                return { ...m, url: await this.storageService.getSignedUrl(m.url) };
            }
            return m;
        }));
    }

    async findOne(id: string) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);

        if ((material.tipo === 'pdf' || material.tipo === 'otro') && !material.url.startsWith('http')) {
            return { ...material, url: await this.storageService.getSignedUrl(material.url) };
        }
        return material;
    }

    async create(dto: {
        curso_id: string;
        titulo: string;
        tipo: TipoMaterial;
        url: string;
        descripcion?: string;
        orden?: number;
        file?: { buffer: Buffer; originalname: string; mimetype: string };
    }) {
        let url = dto.url;

        // Si viene un archivo, subirlo a R2
        if (dto.file) {
            url = await this.storageService.uploadFile(dto.file, `materiales/${dto.curso_id}`);
        }

        const material = this.materialRepo.create({
            curso_id: dto.curso_id,
            titulo: dto.titulo,
            tipo: dto.tipo,
            url,
            descripcion: dto.descripcion ?? null,
            orden: dto.orden ?? 0,
        });
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

        // Si el archivo está en R2, eliminarlo
        if (!material.url.startsWith('http')) {
            await this.storageService.deleteFile(material.url);
        }

        material.activo = false;
        await this.materialRepo.save(material);
        return { message: 'Material eliminado correctamente' };
    }
}