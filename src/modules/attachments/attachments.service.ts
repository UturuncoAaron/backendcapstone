import {
    BadRequestException, ForbiddenException, Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Attachment, AttachmentOwnerType } from './entities/attachment.entity.js';
import { StorageService } from '../storage/storage.service.js';

/** Limite duro por archivo: 10 MB. Coincidir con FE y con CHECK SQL. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Mime types permitidos. Bloqueamos ejecutables y archivos comprimidos. */
export const ATTACHMENT_ALLOWED_MIME: ReadonlySet<string> = new Set([
    // Imágenes
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    // Documentos
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    // Audio / video pequeño
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
    'video/mp4', 'video/webm',
]);

export const ATTACHMENT_MAX_PER_OWNER = 5;

export interface AttachmentDto {
    id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    created_at: Date;
    is_image: boolean;
    is_pdf: boolean;
    is_video: boolean;
    is_audio: boolean;
    /** URL presignada con TTL corto. */
    download_url: string;
    /** URL para previsualización inline (Content-Disposition: inline). */
    preview_url: string;
}

@Injectable()
export class AttachmentsService {
    constructor(
        @InjectRepository(Attachment)
        private readonly repo: Repository<Attachment>,
        private readonly storage: StorageService,
    ) { }

    /** Tamaño + mime + cuota por owner. */
    assertFileValid(file: Express.Multer.File): void {
        if (!file?.buffer) {
            throw new BadRequestException('Archivo vacío');
        }
        if (file.size > ATTACHMENT_MAX_BYTES) {
            throw new BadRequestException(
                `Archivo excede el límite de ${ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB`,
            );
        }
        if (!ATTACHMENT_ALLOWED_MIME.has(file.mimetype)) {
            throw new BadRequestException(`Tipo de archivo no permitido: ${file.mimetype}`);
        }
    }

    async create(
        file: Express.Multer.File,
        owner_type: AttachmentOwnerType,
        owner_id: string,
        uploaded_by: string,
    ): Promise<AttachmentDto> {
        this.assertFileValid(file);

        const existing = await this.repo.count({ where: { owner_type, owner_id } });
        if (existing >= ATTACHMENT_MAX_PER_OWNER) {
            throw new BadRequestException(
                `Máximo ${ATTACHMENT_MAX_PER_OWNER} adjuntos por elemento`,
            );
        }

        const storage_key = await this.storage.uploadFile(
            { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
            `attachments/${owner_type}/${owner_id}`,
        );

        const row = await this.repo.save(this.repo.create({
            owner_type, owner_id,
            storage_key,
            original_name: file.originalname.slice(0, 255),
            mime_type: file.mimetype,
            size_bytes: file.size,
            uploaded_by,
        }));

        return this.toDto(row);
    }

    async listByOwner(
        owner_type: AttachmentOwnerType,
        owner_id: string,
    ): Promise<AttachmentDto[]> {
        const rows = await this.repo.find({
            where: { owner_type, owner_id },
            order: { created_at: 'ASC' },
        });
        return Promise.all(rows.map(r => this.toDto(r)));
    }

    /**
     * Bulk loader para evitar N+1 cuando se listan posts/mensajes con sus adjuntos.
     * Devuelve un map ownerId -> AttachmentDto[].
     */
    async listByOwnersBulk(
        owner_type: AttachmentOwnerType,
        owner_ids: string[],
    ): Promise<Map<string, AttachmentDto[]>> {
        const map = new Map<string, AttachmentDto[]>();
        if (!owner_ids.length) return map;

        const rows = await this.repo.find({
            where: { owner_type, owner_id: In(owner_ids) },
            order: { created_at: 'ASC' },
        });

        const dtos = await Promise.all(rows.map(r => this.toDto(r)));
        for (const d of dtos) {
            // El service que llama ya ordena; agrupamos por owner_id.
            const owner = rows.find(r => r.id === d.id)!.owner_id;
            const list = map.get(owner) ?? [];
            list.push(d);
            map.set(owner, list);
        }
        return map;
    }

    async remove(id: string, requesterId: string, requesterRol: string): Promise<void> {
        const row = await this.repo.findOne({ where: { id } });
        if (!row) throw new NotFoundException('Adjunto no encontrado');

        const isOwner = row.uploaded_by === requesterId;
        const isAdmin = requesterRol === 'admin';
        if (!isOwner && !isAdmin) {
            throw new ForbiddenException('Solo el autor o un admin pueden eliminar');
        }

        await this.storage.deleteFile(row.storage_key).catch(() => undefined);
        await this.repo.delete(id);
    }

    /** Elimina adjuntos en cascada cuando se borra el owner (foro_post/mensaje/etc). */
    async removeByOwner(
        owner_type: AttachmentOwnerType,
        owner_id: string,
    ): Promise<void> {
        const rows = await this.repo.find({ where: { owner_type, owner_id } });
        await Promise.all(rows.map(r => this.storage.deleteFile(r.storage_key).catch(() => undefined)));
        await this.repo.delete({ owner_type, owner_id });
    }

    private async toDto(row: Attachment): Promise<AttachmentDto> {
        const [download_url, preview_url] = await Promise.all([
            this.storage.getDownloadUrl(row.storage_key, row.original_name, 300),
            this.storage.getSignedUrl(row.storage_key, 300),
        ]);
        return {
            id: row.id,
            original_name: row.original_name,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            created_at: row.created_at,
            is_image: row.mime_type.startsWith('image/'),
            is_pdf: row.mime_type === 'application/pdf',
            is_video: row.mime_type.startsWith('video/'),
            is_audio: row.mime_type.startsWith('audio/'),
            download_url,
            preview_url,
        };
    }
}
