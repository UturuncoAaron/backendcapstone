import {
    Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Libreta, LibretaTipo } from './entities/libreta.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { bestMatch, type AlumnoCandidate } from './matching.util.js';

// ── DTOs internos ─────────────────────────────────────────────────────────────

interface UpsertLibretaDto {
    cuenta_id: string;
    tipo: LibretaTipo;
    periodo_id: number;
    subido_por: string;
    rol: string;
    observaciones?: string;
    file: { buffer: Buffer; originalname: string; mimetype: string };
}

interface BulkUpsertParams {
    files: Express.Multer.File[];
    periodoId: number;
    seccionId: string;
    subidoPor: string;
    rol: string;
}

export interface BulkUploadResultItem {
    filename: string;
    alumno_id: string | null;
    alumno_nombre: string | null;
    confidence: 'high' | 'medium' | 'none';
    score: number;
    status: 'uploaded' | 'skipped' | 'error';
    libreta_id?: string;
    error?: string;
}

export interface BulkUploadResult {
    total: number;
    uploaded: number;
    skipped: number;
    errors: number;
    items: BulkUploadResultItem[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class LibretasService {
    private readonly logger = new Logger(LibretasService.name);

    constructor(
        @InjectRepository(Libreta)
        private readonly libretaRepo: Repository<Libreta>,
        private readonly storageService: StorageService,
        private readonly dataSource: DataSource,
    ) { }

    // ══════════════════════════════════════════════════════════════════════════
    // LECTURA
    // ══════════════════════════════════════════════════════════════════════════

    async findByCuenta(cuentaId: string, tipo: LibretaTipo) {
        const libretas = await this.libretaRepo.find({
            where: { cuenta_id: cuentaId, tipo },
            relations: ['periodo'],
            order: { periodo: { anio: 'DESC', bimestre: 'DESC' } },
        });

        return Promise.all(libretas.map(async (l) => ({
            ...l,
            url: await this.storageService.getSignedUrl(l.storage_key),
        })));
    }

    async findHijoForPadre(padreId: string, alumnoId: string) {
        const vinculo = await this.dataSource.query(
            `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2`,
            [padreId, alumnoId],
        );
        if (!vinculo.length) {
            throw new ForbiddenException('No tienes acceso a las libretas de este alumno');
        }
        return this.findByCuenta(alumnoId, 'alumno');
    }

    async findByCuentaAndPeriodo(
        cuentaId: string, periodoId: number, tipo: LibretaTipo,
    ) {
        const libreta = await this.libretaRepo.findOne({
            where: { cuenta_id: cuentaId, periodo_id: periodoId, tipo },
            relations: ['cuenta', 'periodo'],
        });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        return {
            ...libreta,
            url: await this.storageService.getSignedUrl(libreta.storage_key),
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ESCRITURA INDIVIDUAL
    // ══════════════════════════════════════════════════════════════════════════

    async upsert(dto: UpsertLibretaDto) {
        await this.assertCanManage(dto.subido_por, dto.rol, dto.cuenta_id, dto.tipo);

        const existing = await this.libretaRepo.findOne({
            where: {
                cuenta_id: dto.cuenta_id,
                periodo_id: dto.periodo_id,
                tipo: dto.tipo,
            },
        });

        if (existing) {
            await this.storageService.deleteFile(existing.storage_key).catch(() => null);
        }

        const storage_key = await this.storageService.uploadFile(
            dto.file,
            `libretas/${dto.tipo}/${dto.cuenta_id}/periodo-${dto.periodo_id}`,
        );

        if (existing) {
            await this.libretaRepo.update(existing.id, {
                storage_key,
                nombre_archivo: dto.file.originalname,
                subido_por: dto.subido_por,
                observaciones: dto.observaciones ?? null,
            });
            return this.libretaRepo.findOne({
                where: { id: existing.id },
                relations: ['cuenta', 'periodo'],
            });
        }

        const libreta = this.libretaRepo.create({
            cuenta_id: dto.cuenta_id,
            tipo: dto.tipo,
            periodo_id: dto.periodo_id,
            storage_key,
            nombre_archivo: dto.file.originalname,
            subido_por: dto.subido_por,
            observaciones: dto.observaciones ?? null,
        });

        return this.libretaRepo.save(libreta);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CARGA MASIVA CON AUTO-MATCH POR NOMBRE DE ARCHIVO
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Recibe N archivos, obtiene los alumnos matriculados en la sección/periodo,
     * matchea cada archivo contra los alumnos por nombre y sube en paralelo
     * con concurrencia controlada (4 a la vez).
     *
     * Solo sube archivos con confidence 'high' o 'medium'.
     * Archivos sin match (confidence 'none') quedan como 'skipped'.
     */
    async bulkUpsert(params: BulkUpsertParams): Promise<BulkUploadResult> {
        // 1. Alumnos matriculados en la sección/periodo
        const alumnos: AlumnoCandidate[] = await this.dataSource.query(
            `SELECT
                a.id,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno
             FROM matriculas m
             JOIN alumnos a ON a.id = m.alumno_id
             WHERE m.seccion_id = $1
               AND m.periodo_id = $2
               AND m.activo = TRUE`,
            [params.seccionId, params.periodoId],
        );

        if (!alumnos.length) {
            throw new NotFoundException(
                `No hay alumnos matriculados en la sección para este periodo`,
            );
        }

        // 2. Matchear archivos — determinístico, sin I/O
        const matched = params.files.map(file => ({
            file,
            match: bestMatch(file.originalname, alumnos),
        }));

        // 3. Subir en paralelo con concurrencia 4
        const result: BulkUploadResult = {
            total: params.files.length,
            uploaded: 0,
            skipped: 0,
            errors: 0,
            items: [],
        };

        const CONCURRENCY = 4;
        const chunks = [];
        for (let i = 0; i < matched.length; i += CONCURRENCY) {
            chunks.push(matched.slice(i, i + CONCURRENCY));
        }

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async ({ file, match }) => {
                // Sin match suficiente → skipped
                if (!match.alumno || match.confidence === 'none') {
                    result.skipped++;
                    result.items.push({
                        filename: file.originalname,
                        alumno_id: null,
                        alumno_nombre: null,
                        confidence: 'none',
                        score: Math.round(match.score * 100) / 100,
                        status: 'skipped',
                    });
                    return;
                }

                try {
                    const existing = await this.libretaRepo.findOne({
                        where: {
                            cuenta_id: match.alumno.id,
                            periodo_id: params.periodoId,
                            tipo: 'alumno',
                        },
                    });

                    if (existing) {
                        await this.storageService.deleteFile(existing.storage_key).catch(() => null);
                    }

                    const storage_key = await this.storageService.uploadFile(
                        file,
                        `libretas/alumno/${match.alumno.id}/periodo-${params.periodoId}`,
                    );

                    let libretaId: string;

                    if (existing) {
                        await this.libretaRepo.update(existing.id, {
                            storage_key,
                            nombre_archivo: file.originalname,
                            subido_por: params.subidoPor,
                            observaciones: null,
                        });
                        libretaId = existing.id;
                    } else {
                        const nueva = await this.libretaRepo.save(
                            this.libretaRepo.create({
                                cuenta_id: match.alumno.id,
                                tipo: 'alumno',
                                periodo_id: params.periodoId,
                                storage_key,
                                nombre_archivo: file.originalname,
                                subido_por: params.subidoPor,
                                observaciones: null,
                            }),
                        );
                        libretaId = nueva.id;
                    }

                    result.uploaded++;
                    result.items.push({
                        filename: file.originalname,
                        alumno_id: match.alumno.id,
                        alumno_nombre: [
                            match.alumno.apellido_paterno,
                            match.alumno.apellido_materno,
                            ',',
                            match.alumno.nombre,
                        ].filter(Boolean).join(' ').replace(' ,', ','),
                        confidence: match.confidence,
                        score: Math.round(match.score * 100) / 100,
                        status: 'uploaded',
                        libreta_id: libretaId,
                    });
                } catch (err: any) {
                    result.errors++;
                    result.items.push({
                        filename: file.originalname,
                        alumno_id: match.alumno.id,
                        alumno_nombre: `${match.alumno.apellido_paterno}, ${match.alumno.nombre}`,
                        confidence: match.confidence,
                        score: Math.round(match.score * 100) / 100,
                        status: 'error',
                        error: err?.message ?? 'Error al subir archivo',
                    });
                }
            }));
        }

        return result;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ELIMINAR
    // ══════════════════════════════════════════════════════════════════════════

    async remove(id: string, userId: string, rol: string) {
        const libreta = await this.libretaRepo.findOne({ where: { id } });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        await this.assertCanManage(userId, rol, libreta.cuenta_id, libreta.tipo);
        await this.storageService.deleteFile(libreta.storage_key).catch(() => null);
        await this.libretaRepo.remove(libreta);
        return { message: 'Libreta eliminada correctamente' };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // HELPERS PRIVADOS
    // ══════════════════════════════════════════════════════════════════════════

    private async assertCanManage(
        userId: string,
        rol: string,
        cuentaId: string,
        tipo: LibretaTipo,
    ): Promise<void> {
        if (rol === 'admin') return;
        if (rol !== 'docente') {
            throw new ForbiddenException('No tienes permiso para gestionar libretas');
        }
        if (tipo === 'padre') {
            throw new ForbiddenException(
                'Solo dirección puede gestionar la libreta del padre',
            );
        }
        const ok = await this.dataSource.query(
            `SELECT 1
             FROM matriculas m
             JOIN secciones s ON s.id = m.seccion_id
             JOIN periodos  p ON p.id = m.periodo_id
             WHERE m.alumno_id = $1
               AND s.tutor_id  = $2
               AND m.activo    = TRUE
               AND p.activo    = TRUE
             LIMIT 1`,
            [cuentaId, userId],
        );
        if (!ok.length) {
            throw new ForbiddenException(
                'Solo el tutor de su sección o dirección puede gestionar esta libreta',
            );
        }
    }
}