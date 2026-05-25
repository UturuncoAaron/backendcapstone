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
    async findPadresPorSeccion(
        seccionId: string,
        periodoId: string,
        requesterId: string,
        requesterRol: string,
    ) {
        if (requesterRol === 'docente') {
            const tieneAcceso = await this.dataSource.query(
                `SELECT 1 FROM cursos c
                 WHERE c.seccion_id = $1::uuid
                   AND c.docente_id = $2::uuid
                   AND c.activo = TRUE
                 LIMIT 1`,
                [seccionId, requesterId],
            );
            if (!tieneAcceso.length) {
                throw new ForbiddenException(
                    'No tienes acceso a las libretas de esta sección',
                );
            }
        }

        const rows = await this.dataSource.query<Array<{
            id: string;
            nombre: string;
            apellido_paterno: string;
            apellido_materno: string | null;
            relacion: string | null;
            libreta_id: string | null;
            libreta_storage_key: string | null;
            libreta_nombre_archivo: string | null;
        }>>(
            `SELECT
        p.id,
        p.nombre,
        p.apellido_paterno,
        p.apellido_materno,
        p.relacion,
        l.id              AS libreta_id,
        l.storage_key     AS libreta_storage_key,
        l.nombre_archivo  AS libreta_nombre_archivo
     FROM padres p
     JOIN padre_alumno pa ON pa.padre_id = p.id
     JOIN matriculas   m  ON m.alumno_id = pa.alumno_id
     LEFT JOIN libretas l
            ON l.cuenta_id = p.id
           AND l.tipo = 'padre'
           AND l.periodo_id = $2::uuid
     WHERE m.seccion_id = $1::uuid
       AND m.activo = TRUE
     GROUP BY p.id, p.relacion, l.id
     ORDER BY p.apellido_paterno NULLS LAST, p.nombre`,
            [seccionId, periodoId],
        );

        return Promise.all(rows.map(async r => ({
            id: r.id,
            nombre: r.nombre,
            apellido_paterno: r.apellido_paterno,
            apellido_materno: r.apellido_materno,
            relacion: r.relacion ?? 'padre',
            libreta: r.libreta_id && r.libreta_storage_key
                ? {
                    id: r.libreta_id,
                    url: await this.storageService.getSignedUrl(r.libreta_storage_key),
                    nombre_archivo: r.libreta_nombre_archivo,
                }
                : null,
        })));
    }

    /**
     * Para admin: lista PAGINADA de todos los padres con su libreta del periodo.
     * Filtros opcionales: sección, búsqueda libre por nombre/apellidos.
     *
     * Se construyen dos queries (count + page) con sus propios placeholders
     * porque pg rechaza queries con menos `$N` de los parámetros enviados.
     */
    async findPadresAdminPaginated(opts: {
        periodoId: string;
        seccionId: string | null;
        search: string | null;
        page: number;
        limit: number;
    }): Promise<{
        items: Array<{
            id: string;
            nombre: string;
            apellido_paterno: string;
            apellido_materno: string | null;
            relacion: string;
            libreta: { id: string; url: string; nombre_archivo: string | null } | null;
        }>;
        total: number;
        page: number;
        limit: number;
    }> {
        const { periodoId, seccionId, search, page, limit } = opts;
        const offset = (page - 1) * limit;

        // ──────────────────────────────────────────────────────────────
        // Helper que arma WHERE + params para un query base.
        // Devuelve la lista de placeholders propios de cada query.
        // ──────────────────────────────────────────────────────────────
        const buildWhere = (paramsOut: unknown[]) => {
            const parts: string[] = [];

            // hijo con matrícula activa (opcional: filtrar por sección)
            if (seccionId) {
                paramsOut.push(seccionId);
                const sIdx = paramsOut.length;
                parts.push(`EXISTS (
                    SELECT 1
                    FROM   padre_alumno pa
                    JOIN   matriculas   m  ON m.alumno_id = pa.alumno_id AND m.activo = TRUE
                    WHERE  pa.padre_id = p.id AND m.seccion_id = $${sIdx}::uuid
                )`);
            } else {
                parts.push(`EXISTS (
                    SELECT 1
                    FROM   padre_alumno pa
                    JOIN   matriculas   m  ON m.alumno_id = pa.alumno_id AND m.activo = TRUE
                    WHERE  pa.padre_id = p.id
                )`);
            }

            // búsqueda libre por nombre/apellidos
            if (search && search.trim().length > 0) {
                paramsOut.push(`%${search.trim()}%`);
                const qIdx = paramsOut.length;
                parts.push(`(
                    p.nombre            ILIKE $${qIdx} OR
                    p.apellido_paterno  ILIKE $${qIdx} OR
                    COALESCE(p.apellido_materno, '') ILIKE $${qIdx}
                )`);
            }

            // sólo padres con cuenta activa
            parts.push(`EXISTS (SELECT 1 FROM cuentas c WHERE c.id = p.id AND c.activo = TRUE)`);

            return `WHERE ${parts.join(' AND ')}`;
        };

        // ── COUNT ──
        const countParams: unknown[] = [];
        const countWhere = buildWhere(countParams);
        const countRows = await this.dataSource.query<{ total: number | string }[]>(
            `SELECT COUNT(*)::int AS total FROM padres p ${countWhere}`,
            countParams,
        );
        const total = Number(countRows[0]?.total ?? 0);
        if (total === 0) return { items: [], total: 0, page, limit };

        // ── PAGE ── ($1 = periodoId para el LEFT JOIN libretas)
        const pageParams: unknown[] = [periodoId];
        const pageWhere = buildWhere(pageParams);
        pageParams.push(limit);
        const limitIdx = pageParams.length;
        pageParams.push(offset);
        const offsetIdx = pageParams.length;

        const rows = await this.dataSource.query<Array<{
            id: string;
            nombre: string;
            apellido_paterno: string;
            apellido_materno: string | null;
            relacion: string | null;
            libreta_id: string | null;
            libreta_storage_key: string | null;
            libreta_nombre_archivo: string | null;
        }>>(
            `SELECT p.id, p.nombre, p.apellido_paterno, p.apellido_materno, p.relacion,
                    l.id              AS libreta_id,
                    l.storage_key     AS libreta_storage_key,
                    l.nombre_archivo  AS libreta_nombre_archivo
             FROM   padres p
             LEFT   JOIN libretas l
                    ON l.cuenta_id = p.id
                   AND l.tipo      = 'padre'
                   AND l.periodo_id = $1::uuid
             ${pageWhere}
             ORDER BY p.apellido_paterno NULLS LAST, p.nombre
             LIMIT  $${limitIdx} OFFSET $${offsetIdx}`,
            pageParams,
        );

        const items = await Promise.all(rows.map(async r => ({
            id: r.id,
            nombre: r.nombre,
            apellido_paterno: r.apellido_paterno,
            apellido_materno: r.apellido_materno,
            relacion: r.relacion ?? 'padre',
            libreta: r.libreta_id && r.libreta_storage_key
                ? {
                    id: r.libreta_id,
                    url: await this.storageService.getSignedUrl(r.libreta_storage_key),
                    nombre_archivo: r.libreta_nombre_archivo,
                }
                : null,
        })));

        return { items, total, page, limit };
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
        // matriculas ya no tiene periodo_id. Se obtiene el año del periodo
        // y se filtran las matrículas activas de la sección con ese año.
        const alumnos: AlumnoCandidate[] = await this.dataSource.query(
            `SELECT a.id, a.nombre, a.apellido_paterno, a.apellido_materno
             FROM matriculas m
             JOIN alumnos  a ON a.id = m.alumno_id
             JOIN periodos p ON p.id = $2::uuid AND p.anio = m.anio
             WHERE m.seccion_id = $1::uuid
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
        // matriculas ya no tiene periodo_id. Se une a periodos por año (m.anio = p.anio)
        // filtrando por el periodo activo.
        const ok = await this.dataSource.query(
            `SELECT 1 FROM matriculas m
             JOIN secciones s ON s.id = m.seccion_id
             JOIN periodos  p ON p.anio = m.anio AND p.activo = TRUE
             WHERE m.alumno_id = $1 AND s.tutor_id = $2 AND m.activo = TRUE LIMIT 1`,
            [cuentaId, userId],
        );
        if (!ok.length) throw new ForbiddenException('Solo el tutor de su sección o dirección puede gestionar esta libreta');
    }
}