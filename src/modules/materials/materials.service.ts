import {
    Injectable, NotFoundException, ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Material } from './entities/material.entity.js';
import { MaterialView } from './entities/material-view.entity.js';
import { CreateMaterialDto } from './dto/create-material.dto.js';
import { UpdateMaterialDto } from './dto/update-material.dto.js';
import { ToggleMaterialDto } from './dto/toggle-material.dto.js';
import { StorageService } from '../storage/storage.service.js';
import { SemanasService } from '../semanas/semanas.service.js';

const TIPOS_QUE_ACEPTAN_ARCHIVO = ['pdf', 'otro'];

@Injectable()
export class MaterialsService {
    constructor(
        @InjectRepository(Material)
        private readonly materialRepo: Repository<Material>,
        @InjectRepository(MaterialView)
        private readonly viewRepo: Repository<MaterialView>,
        private readonly storageService: StorageService,
        private readonly semanasService: SemanasService,
    ) { }

    async findByCourse(courseId: string, alumnoId?: string) {
        const materials = await this.materialRepo.find({
            where: { curso_id: courseId, activo: true },
            order: {
                bimestre: 'ASC',
                semana: 'ASC',
                orden: 'ASC',
                created_at: 'DESC',
            },
        });

        let visibles = materials;
        if (alumnoId) {
            const ocultas = new Set(await this.semanasService.getHiddenSemanas(courseId));
            visibles = materials.filter(
                (m) => !m.oculto && !(m.semana != null && ocultas.has(m.semana)),
            );
        }

        let vistosSet = new Set<string>();
        if (alumnoId && visibles.length) {
            const ids = visibles.map((m) => m.id);
            const views = await this.viewRepo.find({
                where: { alumno_id: alumnoId, material_id: In(ids) },
                select: ['material_id'],
            });
            vistosSet = new Set(views.map((v) => v.material_id));
        }

        return Promise.all(visibles.map(async (m) => {
            const withUrl = await this.attachAccessUrl(m);
            return alumnoId
                ? { ...withUrl, visto: vistosSet.has(m.id) }
                : withUrl;
        }));
    }

    async toggleVisibility(id: string, dto: ToggleMaterialDto) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);
        material.oculto = dto.oculto;
        return this.materialRepo.save(material);
    }

    async findOne(id: string) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);
        return this.attachAccessUrl(material);
    }

    async create(courseId: string, dto: CreateMaterialDto, file?: Express.Multer.File) {
        const aceptaArchivo = TIPOS_QUE_ACEPTAN_ARCHIVO.includes(dto.tipo);

        if (!file && !dto.url) {
            throw new BadRequestException('Debes proporcionar un archivo o una URL');
        }
        if (file && !aceptaArchivo) {
            throw new BadRequestException(`El tipo "${dto.tipo}" no admite archivos, usa una URL`);
        }

        let storage_key: string | null = null;
        let nombre_original: string | null = null;
        let mime_type: string | null = null;
        let size_bytes: number | null = null;
        let url: string | null = null;

        if (file) {
            storage_key = await this.storageService.uploadFile(file, `materiales/${courseId}`);
            nombre_original = file.originalname;
            mime_type = file.mimetype;
            size_bytes = file.size;
        } else {
            url = dto.url ?? null;
        }

        const material = this.materialRepo.create({
            curso_id: courseId,
            titulo: dto.titulo,
            tipo: dto.tipo,
            url,
            storage_key,
            nombre_original,
            mime_type,
            size_bytes,
            descripcion: dto.descripcion ?? null,
            bimestre: dto.bimestre ?? null,
            semana: dto.semana ?? null,
            orden: dto.orden ?? 0,
        });

        const saved = await this.materialRepo.save(material);
        return this.attachAccessUrl(saved);
    }

    async update(id: string, docenteId: string, rol: string, dto: UpdateMaterialDto) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
            relations: ['curso'],
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);

        if (rol === 'docente' && material.curso.docente_id !== docenteId) {
            throw new ForbiddenException('No tienes permiso para editar este material');
        }

        if (dto.url !== undefined && this.resolveStorageKey(material)) {
            throw new BadRequestException('No puedes cambiar la URL de un material con archivo subido');
        }

        if (dto.titulo !== undefined) material.titulo = dto.titulo;
        if (dto.tipo !== undefined) material.tipo = dto.tipo;
        if (dto.url !== undefined) material.url = dto.url;
        if (dto.descripcion !== undefined) material.descripcion = dto.descripcion ?? null;
        if (dto.bimestre !== undefined) material.bimestre = dto.bimestre ?? null;
        if (dto.semana !== undefined) material.semana = dto.semana ?? null;
        if (dto.orden !== undefined) material.orden = dto.orden ?? 0;

        const saved = await this.materialRepo.save(material);
        return this.attachAccessUrl(saved);
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

        const key = this.resolveStorageKey(material);
        if (key) {
            await this.storageService.deleteFile(key);
        }

        material.activo = false;
        await this.materialRepo.save(material);
        return { message: 'Material eliminado correctamente' };
    }

    async getDownloadInfo(id: string) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);

        const key = this.resolveStorageKey(material);
        if (key) {
            const filename = material.nombre_original ?? material.titulo;
            const url = await this.storageService.getDownloadUrl(key, filename);
            return { url, filename, kind: 'file' as const };
        }
        if (material.url) {
            return { url: material.url, filename: material.titulo, kind: 'link' as const };
        }
        throw new NotFoundException('Este material no tiene un recurso descargable');
    }

    /** URL firmada para visualización inline (sin Content-Disposition: attachment). */
    async getPreviewInfo(id: string) {
        const material = await this.materialRepo.findOne({
            where: { id, activo: true },
        });
        if (!material) throw new NotFoundException(`Material ${id} no encontrado`);

        const key = this.resolveStorageKey(material);
        if (key) {
            const filename = material.nombre_original ?? material.titulo;
            const url = await this.storageService.getSignedUrl(key);
            return {
                url,
                filename,
                mime_type: material.mime_type ?? null,
                kind: 'file' as const,
            };
        }
        if (material.url) {
            return {
                url: material.url,
                filename: material.titulo,
                mime_type: material.mime_type ?? null,
                kind: 'link' as const,
            };
        }
        throw new NotFoundException('Este material no tiene un recurso visualizable');
    }

    /** Marca un material como visto por el alumno (idempotente). */
    async markViewed(materialId: string, alumnoId: string) {
        const material = await this.materialRepo.findOne({
            where: { id: materialId, activo: true },
        });
        if (!material) throw new NotFoundException(`Material ${materialId} no encontrado`);

        const existing = await this.viewRepo.findOne({
            where: { alumno_id: alumnoId, material_id: materialId },
        });
        if (existing) return { visto: true, fecha: existing.fecha };

        const view = this.viewRepo.create({
            alumno_id: alumnoId,
            material_id: materialId,
        });
        const saved = await this.viewRepo.save(view);
        return { visto: true, fecha: saved.fecha };
    }

    /** Devuelve progreso por (bimestre, semana) — solo aplica a alumno. */
    async getCourseProgress(courseId: string, alumnoId: string) {
        const materials = await this.materialRepo.find({
            where: { curso_id: courseId, activo: true },
            select: ['id', 'bimestre', 'semana'],
        });

        let vistos = new Set<string>();
        if (materials.length) {
            const views = await this.viewRepo.find({
                where: {
                    alumno_id: alumnoId,
                    material_id: In(materials.map(m => m.id)),
                },
                select: ['material_id'],
            });
            vistos = new Set(views.map(v => v.material_id));
        }

        const map = new Map<string, {
            semana: number | null;
            bimestre: number | null;
            total: number;
            completados: number;
        }>();
        for (const m of materials) {
            const key = `${m.bimestre ?? 'x'}-${m.semana ?? 'x'}`;
            let entry = map.get(key);
            if (!entry) {
                entry = { semana: m.semana, bimestre: m.bimestre, total: 0, completados: 0 };
                map.set(key, entry);
            }
            entry.total += 1;
            if (vistos.has(m.id)) entry.completados += 1;
        }
        return [...map.values()];
    }

    /** Devuelve la storage key, manejando registros antiguos que la guardaban en `url`. */
    private resolveStorageKey(material: Material): string | null {
        if (material.storage_key) return material.storage_key;
        if (material.url && !material.url.startsWith('http')) return material.url;
        return null;
    }

    private async attachAccessUrl(material: Material) {
        const key = this.resolveStorageKey(material);
        if (key) {
            const url = await this.storageService.getSignedUrl(key);
            return { ...material, url };
        }
        return material;
    }
}
