import {
    Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Libreta } from './entities/libreta.entity.js';
import { StorageService } from '../storage/storage.service.js';

@Injectable()
export class LibretasService {
    private readonly logger = new Logger(LibretasService.name);

    constructor(
        @InjectRepository(Libreta)
        private readonly libretaRepo: Repository<Libreta>,
        private readonly storageService: StorageService,
    ) { }

    /** Listar libretas de un alumno */
    async findByAlumno(alumnoId: string) {
        const libretas = await this.libretaRepo.find({
            where: { alumno_id: alumnoId },
            relations: ['curso', 'periodo'],
            order: { bimestre: 'ASC', created_at: 'DESC' },
        });

        return Promise.all(libretas.map(async (l) => ({
            ...l,
            url: await this.storageService.getSignedUrl(l.storage_key),
        })));
    }

    /** Listar libretas de un curso por bimestre */
    async findByCurso(cursoId: string, bimestre?: number) {
        const where: any = { curso_id: cursoId };
        if (bimestre) where.bimestre = bimestre;

        const libretas = await this.libretaRepo.find({
            where,
            relations: ['alumno', 'periodo'],
            order: { bimestre: 'ASC' },
        });

        return Promise.all(libretas.map(async (l) => ({
            ...l,
            url: await this.storageService.getSignedUrl(l.storage_key),
        })));
    }

    /** Obtener libreta específica de un alumno en un curso y bimestre */
    async findOne(alumnoId: string, cursoId: string, bimestre: number) {
        const libreta = await this.libretaRepo.findOne({
            where: { alumno_id: alumnoId, curso_id: cursoId, bimestre },
            relations: ['alumno', 'curso', 'periodo'],
        });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        return {
            ...libreta,
            url: await this.storageService.getSignedUrl(libreta.storage_key),
        };
    }

    /** Subir o reemplazar libreta */
    async upsert(dto: {
        alumno_id: string;
        curso_id: string;
        periodo_id: number;
        bimestre: number;
        subido_por: string;
        observaciones?: string;
        file: { buffer: Buffer; originalname: string; mimetype: string };
    }) {
        // Si ya existe, eliminar el archivo anterior de R2
        const existing = await this.libretaRepo.findOne({
            where: {
                alumno_id: dto.alumno_id,
                curso_id: dto.curso_id,
                bimestre: dto.bimestre,
            },
        });

        if (existing) {
            await this.storageService.deleteFile(existing.storage_key);
        }

        const storage_key = await this.storageService.uploadFile(
            dto.file,
            `libretas/${dto.curso_id}/bimestre-${dto.bimestre}`,
        );

        const libreta = this.libretaRepo.create({
            alumno_id: dto.alumno_id,
            curso_id: dto.curso_id,
            periodo_id: dto.periodo_id,
            bimestre: dto.bimestre,
            storage_key,
            nombre_archivo: dto.file.originalname,
            subido_por: dto.subido_por,
            observaciones: dto.observaciones ?? null,
        });

        if (existing) {
            await this.libretaRepo.update(existing.id, {
                storage_key,
                nombre_archivo: dto.file.originalname,
                subido_por: dto.subido_por,
                observaciones: dto.observaciones ?? null,
            });
            return { ...existing, storage_key };
        }

        return this.libretaRepo.save(libreta);
    }

    /** Eliminar libreta */
    async remove(id: string, userId: string, rol: string) {
        const libreta = await this.libretaRepo.findOne({ where: { id } });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        if (rol === 'docente' && libreta.subido_por !== userId) {
            throw new ForbiddenException('No tienes permiso para eliminar esta libreta');
        }

        await this.storageService.deleteFile(libreta.storage_key);
        await this.libretaRepo.remove(libreta);
        return { message: 'Libreta eliminada correctamente' };
    }
}
