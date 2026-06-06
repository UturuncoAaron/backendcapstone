import {
    Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RecordedClass } from './entities/recorded-class.entity.js';
import { RecordedClassView } from './entities/recorded-class-view.entity.js';
import { CreateRecordedClassDto } from './dto/recorded-classes.dto.js';
import { UpdateRecordedClassDto } from './dto/recorded-classes.dto.js';
import { ToggleRecordedClassDto } from './dto/recorded-classes.dto.js';

function detectProveedor(url: string): 'youtube' | 'drive' {
    if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
    if (/drive\.google\.com/.test(url)) return 'drive';
    throw new BadRequestException('Solo se aceptan URLs de YouTube o Google Drive');
}

function extractVideoId(url: string, proveedor: 'youtube' | 'drive'): string {
    if (proveedor === 'youtube') {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        throw new BadRequestException('URL de YouTube no válida');
    }
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId) return matchId[1];
    throw new BadRequestException('URL de Google Drive no válida');
}

function buildEmbedUrl(proveedor: 'youtube' | 'drive', videoId: string): string {
    if (proveedor === 'youtube') return `https://www.youtube.com/embed/${videoId}`;
    return `https://drive.google.com/file/d/${videoId}/preview`;
}

function buildThumbnailUrl(proveedor: 'youtube' | 'drive', videoId: string): string | null {
    if (proveedor === 'youtube') return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return null;
}

@Injectable()
export class RecordedClassesService {
    constructor(
        @InjectRepository(RecordedClass)
        private readonly grabadaRepo: Repository<RecordedClass>,
        @InjectRepository(RecordedClassView)
        private readonly vistaRepo: Repository<RecordedClassView>,
        private readonly ds: DataSource,
    ) { }

    async findByCourse(courseId: string, cuentaId?: string) {
        const grabadas = await this.grabadaRepo.find({
            where: { curso_id: courseId, activo: true },
            order: { created_at: 'DESC' },
        });

        const visibles = cuentaId
            ? grabadas.filter(g => !g.oculto)
            : grabadas;

        let vistasSet = new Set<string>();
        if (cuentaId && visibles.length) {
            const vistas = await this.vistaRepo.find({
                where: { cuenta_id: cuentaId },
                select: ['grabacion_id'],
            });
            vistasSet = new Set(vistas.map(v => v.grabacion_id));
        }

        return visibles.map(g => this.formatGrabada(g, cuentaId ? vistasSet.has(g.id) : undefined));
    }

    async findOne(id: string) {
        const grabada = await this.grabadaRepo.findOne({
            where: { id, activo: true },
        });
        if (!grabada) throw new NotFoundException(`Grabación ${id} no encontrada`);
        return this.formatGrabada(grabada);
    }

    async create(courseId: string, dto: CreateRecordedClassDto) {
        const proveedor = detectProveedor(dto.url_original);
        const video_id = extractVideoId(dto.url_original, proveedor);

        const grabada = this.grabadaRepo.create({
            curso_id: courseId,
            titulo: dto.titulo,
            descripcion: dto.descripcion ?? null,
            proveedor,
            video_id,
            url_original: dto.url_original,
        });

        const saved = await this.grabadaRepo.save(grabada);
        return this.formatGrabada(saved);
    }

    async update(id: string, dto: UpdateRecordedClassDto) {
        const grabada = await this.grabadaRepo.findOne({
            where: { id, activo: true },
        });
        if (!grabada) throw new NotFoundException(`Grabación ${id} no encontrada`);

        if (dto.titulo !== undefined) grabada.titulo = dto.titulo;
        if (dto.descripcion !== undefined) grabada.descripcion = dto.descripcion ?? null;
        if (dto.oculto !== undefined) grabada.oculto = dto.oculto;

        const saved = await this.grabadaRepo.save(grabada);
        return this.formatGrabada(saved);
    }

    async toggle(id: string, dto: ToggleRecordedClassDto) {
        const grabada = await this.grabadaRepo.findOne({
            where: { id, activo: true },
        });
        if (!grabada) throw new NotFoundException(`Grabación ${id} no encontrada`);
        grabada.oculto = dto.oculto;
        return this.grabadaRepo.save(grabada);
    }

    async remove(id: string) {
        const grabada = await this.grabadaRepo.findOne({
            where: { id, activo: true },
        });
        if (!grabada) throw new NotFoundException(`Grabación ${id} no encontrada`);
        grabada.activo = false;
        await this.grabadaRepo.save(grabada);
        return { message: 'Grabación eliminada correctamente' };
    }

    async registerView(grabacionId: string, cuentaId: string) {
        const grabada = await this.grabadaRepo.findOne({
            where: { id: grabacionId, activo: true },
        });
        if (!grabada) throw new NotFoundException(`Grabación ${grabacionId} no encontrada`);

        await this.ds.query(
            `INSERT INTO grabaciones_vistas (grabacion_id, cuenta_id)
             VALUES ($1, $2)
             ON CONFLICT (grabacion_id, cuenta_id) DO UPDATE
                 SET veces_vista     = grabaciones_vistas.veces_vista + 1,
                     ultima_vista_en = NOW()`,
            [grabacionId, cuentaId],
        );

        return { registrado: true };
    }

    async getViewStats(grabacionId: string) {
        const grabada = await this.grabadaRepo.findOne({
            where: { id: grabacionId, activo: true },
        });
        if (!grabada) throw new NotFoundException(`Grabación ${grabacionId} no encontrada`);

        const rows = await this.ds.query(
            `SELECT COUNT(*)::int AS total_vistas,
                    COUNT(DISTINCT cuenta_id)::int AS total_cuentas
             FROM grabaciones_vistas
             WHERE grabacion_id = $1`,
            [grabacionId],
        ) as { total_vistas: number; total_cuentas: number }[];

        return rows[0];
    }

    private formatGrabada(g: RecordedClass, visto?: boolean) {
        const embed_url = buildEmbedUrl(g.proveedor, g.video_id);
        const thumbnail_url = buildThumbnailUrl(g.proveedor, g.video_id);
        const result: Record<string, unknown> = {
            id: g.id,
            curso_id: g.curso_id,
            titulo: g.titulo,
            descripcion: g.descripcion,
            proveedor: g.proveedor,
            video_id: g.video_id,
            url_original: g.url_original,
            embed_url,
            thumbnail_url,
            oculto: g.oculto,
            activo: g.activo,
            created_at: g.created_at,
            updated_at: g.updated_at,
        };
        if (visto !== undefined) result['visto'] = visto;
        return result;
    }
}