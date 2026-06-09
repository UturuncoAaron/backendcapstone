import {
    BadRequestException, ForbiddenException, Injectable, Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { PsychologyArchivo } from '../entities/psychology-archivo.entity.js';
import { PsychologistStudent } from '../entities/psychologist-student.entity.js';
import { StorageService } from '../../storage/storage.service.js';
import { CreateArchivoDto, ArchivoQueryDto } from '../dto/psychology.dto.js';

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

@Injectable()
export class PsychologyArchivosService {
    private readonly logger = new Logger(PsychologyArchivosService.name);

    constructor(
        @InjectRepository(PsychologyArchivo)
        private readonly archivoRepo: Repository<PsychologyArchivo>,
        @InjectRepository(PsychologistStudent)
        private readonly assignmentRepo: Repository<PsychologistStudent>,
        private readonly dataSource: DataSource,
        private readonly storage: StorageService,
    ) { }

    async upload(
        psychologistId: string,
        studentId: string,
        file: Express.Multer.File,
        dto: CreateArchivoDto,
    ): Promise<PsychologyArchivo> {
        if (!file) throw new BadRequestException('Archivo requerido');
        if (!file.size) throw new BadRequestException('Archivo vacío');
        if (file.size > MAX_ARCHIVO_BYTES) {
            throw new BadRequestException(
                `El archivo no puede superar ${MAX_ARCHIVO_BYTES / 1024 / 1024} MB`,
            );
        }

        await this.ensureAssigned(psychologistId, studentId);

        const key = await this.storage.uploadFile(file, `psychology/${dto.categoria}`);

        const archivo = this.archivoRepo.create({
            psychologistId,
            studentId,
            categoria: dto.categoria,
            nombre: dto.nombre?.trim() || file.originalname,
            descripcion: dto.descripcion?.trim() || null,
            confidencial: dto.confidencial !== 'false',
            storageKey: key,
            nombreOriginal: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
        });
        return this.archivoRepo.save(archivo);
    }

    async list(
        psychologistId: string,
        studentId: string,
        q: ArchivoQueryDto,
    ) {
        const assigned = await this.isAssigned(psychologistId, studentId);
        if (!assigned) {
            return { data: [], total: 0, page: 1, limit: q.limit ?? 50, totalPages: 1 };
        }

        const page = q.page ?? 1;
        const limit = q.limit ?? 50;
        const where: Record<string, unknown> = { studentId };
        if (q.categoria) where['categoria'] = q.categoria;

        const [items, total] = await this.archivoRepo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            data: items, total, page, limit,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

    async getDownloadUrl(psychologistId: string, archivoId: string) {
        const archivo = await this.assertOwned(psychologistId, archivoId);
        const url = await this.storage.getDownloadUrl(
            archivo.storageKey,
            archivo.nombreOriginal ?? archivo.nombre,
        );
        return { url };
    }

    async delete(psychologistId: string, archivoId: string): Promise<void> {
        const archivo = await this.assertOwned(psychologistId, archivoId);
        await this.storage.deleteFile(archivo.storageKey).catch((e) =>
            this.logger.warn(`R2 delete falló: ${(e as Error).message}`),
        );
        await this.archivoRepo.remove(archivo);
    }

    listForAlumno(alumnoId: string, categoria?: 'ficha' | 'test') {
        const where: Record<string, unknown> = {
            studentId: alumnoId,
            confidencial: false,
        };
        if (categoria) where['categoria'] = categoria;
        return this.archivoRepo.find({ where, order: { createdAt: 'DESC' } });
    }

    listForPadre(alumnoId: string, categoria?: 'ficha' | 'test') {
        const where: Record<string, unknown> = {
            studentId: alumnoId,
            confidencial: false,
        };
        if (categoria) where['categoria'] = categoria;
        return this.archivoRepo.find({ where, order: { createdAt: 'DESC' } });
    }

    async resolveDownload(
        archivoId: string,
        viewer: { role: 'alumno'; userId: string } | { role: 'padre'; userId: string },
    ): Promise<{ url: string }> {
        const archivo = await this.archivoRepo.findOne({ where: { id: archivoId } });
        if (!archivo) throw new NotFoundException('Archivo no encontrado');

        if (viewer.role === 'alumno') {
            if (archivo.studentId !== viewer.userId) throw new ForbiddenException('Sin acceso');
        } else {
            if (archivo.confidencial) throw new ForbiddenException('Archivo confidencial');
            const r = await this.dataSource.query<{ exists: boolean }[]>(
                `SELECT EXISTS (
                     SELECT 1 FROM padre_alumno
                      WHERE padre_id = $1 AND alumno_id = $2
                 ) AS "exists"`,
                [viewer.userId, archivo.studentId],
            );
            if (!r[0]?.exists) throw new ForbiddenException('No es tu hijo/a');
        }

        const url = await this.storage.getDownloadUrl(
            archivo.storageKey,
            archivo.nombreOriginal ?? archivo.nombre,
        );
        return { url };
    }

    async resolvePreview(
        archivoId: string,
        viewer: { role: 'alumno'; userId: string } | { role: 'padre'; userId: string },
    ): Promise<{ url: string }> {
        const archivo = await this.archivoRepo.findOne({ where: { id: archivoId } });
        if (!archivo) throw new NotFoundException('Archivo no encontrado');

        if (viewer.role === 'alumno') {
            if (archivo.studentId !== viewer.userId) throw new ForbiddenException('Sin acceso');
        } else {
            if (archivo.confidencial) throw new ForbiddenException('Archivo confidencial');
            const r = await this.dataSource.query<{ exists: boolean }[]>(
                `SELECT EXISTS (
                     SELECT 1 FROM padre_alumno
                      WHERE padre_id = $1 AND alumno_id = $2
                 ) AS "exists"`,
                [viewer.userId, archivo.studentId],
            );
            if (!r[0]?.exists) throw new ForbiddenException('No es tu hijo/a');
        }

        const url = await this.storage.getPreviewUrl(archivo.storageKey);
        return { url };
    }

    private async isAssigned(psychologistId: string, studentId: string): Promise<boolean> {
        return this.assignmentRepo.exist({
            where: { psychologistId, studentId, activo: true },
        });
    }

    private async ensureAssigned(psychologistId: string, studentId: string): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO psicologa_alumno (psicologa_id, alumno_id, activo, desde)
             VALUES ($1, $2, TRUE, CURRENT_DATE)
             ON CONFLICT (psicologa_id, alumno_id)
             DO UPDATE SET activo = TRUE, hasta = NULL`,
            [psychologistId, studentId],
        );
    }

    private async assertOwned(psychologistId: string, archivoId: string) {
        const archivo = await this.archivoRepo.findOne({ where: { id: archivoId } });
        if (!archivo) throw new NotFoundException('Archivo no encontrado');
        if (archivo.psychologistId !== psychologistId) {
            throw new ForbiddenException('Este archivo pertenece a otra psicóloga');
        }
        return archivo;
    }
    async getPreviewUrl(psychologistId: string, archivoId: string) {
        const archivo = await this.assertOwned(psychologistId, archivoId);
        const url = await this.storage.getPreviewUrl(archivo.storageKey);
        return { url };
    }
}