import {
    Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Libreta, LibretaTipo } from './entities/libreta.entity.js';
import { LibretaLectura } from './entities/libreta-lectura.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { bestMatch, type AlumnoCandidate } from './matching.util.js';
import { PermissionsService } from '../permissions/permissions.service.js';

// Permission grant: admin entrega esta key a un docente/auxiliar para que
// pueda subir libretas de PADRE (las del alumno las sube el docente por defecto).
export const PERMISO_LIBRETAS_SUBIR_PADRE = { modulo: 'libretas', accion: 'subir_padre' } as const;

interface UpsertLibretaDto {
    cuenta_id: string;
    tipo: LibretaTipo;
    periodo_id: string;
    subido_por: string;
    rol: string;
    observaciones?: string;
    file: { buffer: Buffer; originalname: string; mimetype: string };
}

interface BulkUpsertParams {
    files: Express.Multer.File[];
    periodoId: string;
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

@Injectable()
export class LibretasService {
    private readonly logger = new Logger(LibretasService.name);

    constructor(
        @InjectRepository(Libreta)
        private readonly libretaRepo: Repository<Libreta>,
        @InjectRepository(LibretaLectura)
        private readonly lecturaRepo: Repository<LibretaLectura>,
        private readonly storageService: StorageService,
        private readonly dataSource: DataSource,
        private readonly permissions: PermissionsService,
    ) { }

    // ──────────────────────────────────────────────────────────────────────
    // LECTURAS: tracking de "padre/alumno vio la libreta"
    // ──────────────────────────────────────────────────────────────────────

    /** Marca una libreta como leída por el usuario actual (idempotente). */
    async marcarVista(libretaId: string, lectorId: string): Promise<{ vista_en: Date }> {
        const libreta = await this.libretaRepo.findOne({ where: { id: libretaId } });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        const existing = await this.lecturaRepo.findOne({
            where: { libreta_id: libretaId, lector_id: lectorId },
        });
        if (existing) return { vista_en: existing.vista_en };

        const row = await this.lecturaRepo.save(this.lecturaRepo.create({
            libreta_id: libretaId, lector_id: lectorId,
        }));
        return { vista_en: row.vista_en };
    }

    /** Para admin/docente: lista de lectores con la fecha en que vieron la libreta. */
    async listLecturas(libretaId: string) {
        return this.dataSource.query<{
            lector_id: string;
            nombre: string | null;
            apellidos: string | null;
            rol: string;
            vista_en: Date;
        }[]>(
            `SELECT
                ll.lector_id,
                COALESCE(p.nombre, a.nombre)                                   AS nombre,
                CONCAT_WS(' ',
                    COALESCE(p.apellido_paterno, a.apellido_paterno),
                    COALESCE(p.apellido_materno, a.apellido_materno))          AS apellidos,
                c.rol,
                ll.vista_en
             FROM libretas_lecturas ll
             JOIN cuentas c ON c.id = ll.lector_id
             LEFT JOIN padres  p ON p.id = c.id
             LEFT JOIN alumnos a ON a.id = c.id
             WHERE ll.libreta_id = $1
             ORDER BY ll.vista_en DESC`,
            [libretaId],
        );
    }

    /** Bulk: dado un set de libretas, devuelve set de ids ya leídas por lectorId. */
    async getLeidasSet(libretaIds: string[], lectorId: string): Promise<Set<string>> {
        if (!libretaIds.length) return new Set();
        const rows = await this.lecturaRepo.find({
            where: libretaIds.map(id => ({ libreta_id: id, lector_id: lectorId })),
            select: ['libreta_id'],
        });
        return new Set(rows.map(r => r.libreta_id));
    }

    async findByCuenta(cuentaId: string, tipo: LibretaTipo, lectorId?: string) {
        const libretas = await this.libretaRepo.find({
            where: { cuenta_id: cuentaId, tipo },
            relations: ['periodo'],
            order: { periodo: { anio: 'DESC', bimestre: 'DESC' } },
        });
        const leidas = lectorId
            ? await this.getLeidasSet(libretas.map(l => l.id), lectorId)
            : new Set<string>();
        return Promise.all(libretas.map(async (l) => ({
            ...l,
            url: await this.storageService.getSignedUrl(l.storage_key),
            leida: leidas.has(l.id),
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
        return this.findByCuenta(alumnoId, 'alumno', padreId);
    }

    async findByCuentaAndPeriodo(cuentaId: string, periodoId: string, tipo: LibretaTipo) {
        const libreta = await this.libretaRepo.findOne({
            where: { cuenta_id: cuentaId, periodo_id: periodoId, tipo },
            relations: ['cuenta', 'periodo'],
        });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');
        return { ...libreta, url: await this.storageService.getSignedUrl(libreta.storage_key) };
    }

    async upsert(dto: UpsertLibretaDto) {
        await this.assertCanManage(dto.subido_por, dto.rol, dto.cuenta_id, dto.tipo);

        const existing = await this.libretaRepo.findOne({
            where: { cuenta_id: dto.cuenta_id, periodo_id: dto.periodo_id, tipo: dto.tipo },
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
            return this.libretaRepo.findOne({ where: { id: existing.id }, relations: ['cuenta', 'periodo'] });
        }

        return this.libretaRepo.save(this.libretaRepo.create({
            cuenta_id: dto.cuenta_id,
            tipo: dto.tipo,
            periodo_id: dto.periodo_id,
            storage_key,
            nombre_archivo: dto.file.originalname,
            subido_por: dto.subido_por,
            observaciones: dto.observaciones ?? null,
        }));
    }

    async bulkUpsert(params: BulkUpsertParams): Promise<BulkUploadResult> {
        const alumnos: AlumnoCandidate[] = await this.dataSource.query(
            `SELECT a.id, a.nombre, a.apellido_paterno, a.apellido_materno
             FROM matriculas m
             JOIN alumnos a ON a.id = m.alumno_id
             WHERE m.seccion_id = $1::uuid
               AND m.periodo_id = $2::uuid
               AND m.activo = TRUE`,
            [params.seccionId, params.periodoId],
        );

        if (!alumnos.length) {
            throw new NotFoundException(`No hay alumnos matriculados en la sección para este periodo`);
        }

        const matched = params.files.map(file => ({ file, match: bestMatch(file.originalname, alumnos) }));
        const result: BulkUploadResult = { total: params.files.length, uploaded: 0, skipped: 0, errors: 0, items: [] };
        const CONCURRENCY = 4;
        const chunks: typeof matched[] = [];
        for (let i = 0; i < matched.length; i += CONCURRENCY) chunks.push(matched.slice(i, i + CONCURRENCY));

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async ({ file, match }) => {
                if (!match.alumno || match.confidence === 'none') {
                    result.skipped++;
                    result.items.push({ filename: file.originalname, alumno_id: null, alumno_nombre: null, confidence: 'none', score: Math.round(match.score * 100) / 100, status: 'skipped' });
                    return;
                }
                try {
                    const existing = await this.libretaRepo.findOne({
                        where: { cuenta_id: match.alumno.id, periodo_id: params.periodoId, tipo: 'alumno' },
                    });
                    if (existing) await this.storageService.deleteFile(existing.storage_key).catch(() => null);

                    const storage_key = await this.storageService.uploadFile(
                        file, `libretas/alumno/${match.alumno.id}/periodo-${params.periodoId}`,
                    );

                    let libretaId: string;
                    if (existing) {
                        await this.libretaRepo.update(existing.id, { storage_key, nombre_archivo: file.originalname, subido_por: params.subidoPor, observaciones: null });
                        libretaId = existing.id;
                    } else {
                        const nueva = await this.libretaRepo.save(this.libretaRepo.create({
                            cuenta_id: match.alumno.id, tipo: 'alumno', periodo_id: params.periodoId,
                            storage_key, nombre_archivo: file.originalname, subido_por: params.subidoPor, observaciones: null,
                        }));
                        libretaId = nueva.id;
                    }

                    result.uploaded++;
                    result.items.push({
                        filename: file.originalname, alumno_id: match.alumno.id,
                        alumno_nombre: [match.alumno.apellido_paterno, match.alumno.apellido_materno, ',', match.alumno.nombre].filter(Boolean).join(' ').replace(' ,', ','),
                        confidence: match.confidence, score: Math.round(match.score * 100) / 100, status: 'uploaded', libreta_id: libretaId,
                    });
                } catch (err: any) {
                    result.errors++;
                    result.items.push({
                        filename: file.originalname, alumno_id: match.alumno.id,
                        alumno_nombre: `${match.alumno.apellido_paterno}, ${match.alumno.nombre}`,
                        confidence: match.confidence, score: Math.round(match.score * 100) / 100, status: 'error', error: err?.message ?? 'Error al subir archivo',
                    });
                }
            }));
        }
        return result;
    }

    async remove(id: string, userId: string, rol: string) {
        const libreta = await this.libretaRepo.findOne({ where: { id } });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');
        await this.assertCanManage(userId, rol, libreta.cuenta_id, libreta.tipo);
        await this.storageService.deleteFile(libreta.storage_key).catch(() => null);
        await this.libretaRepo.remove(libreta);
        return { message: 'Libreta eliminada correctamente' };
    }

    /**
     * Reglas de autoría:
     *   • Libreta del ALUMNO: la sube el tutor docente de la sección o admin.
     *   • Libreta del PADRE : la sube admin, o cualquier cuenta a quien admin
     *     le haya otorgado el permiso explícito `libretas:subir_padre`
     *     (típicamente un docente designado por dirección/secretaría).
     */
    private async assertCanManage(userId: string, rol: string, cuentaId: string, tipo: LibretaTipo): Promise<void> {
        if (rol === 'admin') return;

        if (tipo === 'padre') {
            const tienePermiso = await this.permissions.hasPermiso(
                userId,
                PERMISO_LIBRETAS_SUBIR_PADRE.modulo,
                PERMISO_LIBRETAS_SUBIR_PADRE.accion,
            );
            if (!tienePermiso) {
                throw new ForbiddenException(
                    'Para subir la libreta del padre necesitas permiso explícito otorgado por dirección',
                );
            }
            return;
        }

        if (rol !== 'docente') throw new ForbiddenException('No tienes permiso para gestionar libretas');
        const ok = await this.dataSource.query(
            `SELECT 1 FROM matriculas m
             JOIN secciones s ON s.id = m.seccion_id
             JOIN periodos  p ON p.id = m.periodo_id
             WHERE m.alumno_id = $1 AND s.tutor_id = $2 AND m.activo = TRUE AND p.activo = TRUE LIMIT 1`,
            [cuentaId, userId],
        );
        if (!ok.length) throw new ForbiddenException('Solo el tutor de su sección o dirección puede gestionar esta libreta');
    }
}