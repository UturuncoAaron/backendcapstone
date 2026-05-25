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

// ─── Auditoría de lectura ────────────────────────────────────────────────
interface PadreRow {
    id: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    relacion: string | null;
}

interface LecturaInfo {
    vista_en: Date;
    ultima_apertura_en: Date;
    veces_vista: number;
}

interface LibretaConLectura {
    id: string;
    url: string;
    nombre_archivo: string | null;
    lectura: LecturaInfo | null;
}

interface HijoConLibreta {
    alumno_id: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    grado: string | null;
    seccion: string | null;
    libreta: LibretaConLectura | null;
}

export interface PadreConAuditoria {
    id: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    relacion: string;
    libreta: LibretaConLectura | null;
    hijos: HijoConLibreta[];
    resumen_lectura: {
        propia_cargada: boolean;
        propia_leida: boolean;
        hijos_total: number;
        hijos_cargados: number;
        hijos_leidos: number;
    };
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

    /**
     * Registra una apertura de libreta por el usuario actual.
     * - Primera vez: crea la fila con `veces_vista=1`, `vista_en=NOW()`.
     * - Aperturas posteriores: incrementa `veces_vista` y actualiza
     *   `ultima_apertura_en`. `vista_en` queda inmutable como primera vista.
     * Devuelve siempre el snapshot final de auditoría.
     */
    async marcarVista(
        libretaId: string,
        lectorId: string,
    ): Promise<{ vista_en: Date; ultima_apertura_en: Date; veces_vista: number }> {
        const libreta = await this.libretaRepo.findOne({ where: { id: libretaId } });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        const existing = await this.lecturaRepo.findOne({
            where: { libreta_id: libretaId, lector_id: lectorId },
        });

        if (existing) {
            const now = new Date();
            await this.lecturaRepo.update(existing.id, {
                veces_vista: existing.veces_vista + 1,
                ultima_apertura_en: now,
            });
            return {
                vista_en: existing.vista_en,
                ultima_apertura_en: now,
                veces_vista: existing.veces_vista + 1,
            };
        }

        const row = await this.lecturaRepo.save(this.lecturaRepo.create({
            libreta_id: libretaId,
            lector_id: lectorId,
        }));
        return {
            vista_en: row.vista_en,
            ultima_apertura_en: row.ultima_apertura_en,
            veces_vista: row.veces_vista,
        };
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

        const rows = await this.dataSource.query<PadreRow[]>(
            `SELECT DISTINCT
                p.id,
                p.nombre,
                p.apellido_paterno,
                p.apellido_materno,
                p.relacion
             FROM padres p
             JOIN padre_alumno pa ON pa.padre_id = p.id
             JOIN matriculas   m  ON m.alumno_id = pa.alumno_id
             WHERE m.seccion_id = $1::uuid
               AND m.activo = TRUE
             ORDER BY p.apellido_paterno NULLS LAST, p.nombre`,
            [seccionId],
        );

        return this.hydratePadresAuditoria(rows, periodoId, seccionId);
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
        items: PadreConAuditoria[];
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

        // ── PAGE ── (sin LEFT JOIN libretas, hydratePadresAuditoria lo hace)
        const pageParams: unknown[] = [];
        const pageWhere = buildWhere(pageParams);
        pageParams.push(limit);
        const limitIdx = pageParams.length;
        pageParams.push(offset);
        const offsetIdx = pageParams.length;

        const rows = await this.dataSource.query<PadreRow[]>(
            `SELECT p.id, p.nombre, p.apellido_paterno, p.apellido_materno, p.relacion
             FROM   padres p
             ${pageWhere}
             ORDER BY p.apellido_paterno NULLS LAST, p.nombre
             LIMIT  $${limitIdx} OFFSET $${offsetIdx}`,
            pageParams,
        );

        const items = await this.hydratePadresAuditoria(rows, periodoId, seccionId);
        return { items, total, page, limit };
    }

    /**
     * Hidrata una lista de padres con la auditoría de lectura del periodo:
     *   - `libreta_propia`: la libreta del padre con lectura.
     *   - `hijos`: cada hijo del padre (filtrado por sección si aplica) con
     *      su libreta y lectura por el padre.
     *   - `resumen_lectura`: contadores agregados para badges rápidos.
     */
    private async hydratePadresAuditoria(
        padres: PadreRow[],
        periodoId: string,
        seccionId: string | null,
    ): Promise<PadreConAuditoria[]> {
        if (!padres.length) return [];
        const padreIds = padres.map(p => p.id);

        // 1) Libretas del PADRE en este periodo + lectura por el mismo padre.
        const libretasPadre = await this.dataSource.query<Array<{
            cuenta_id: string;
            libreta_id: string;
            storage_key: string;
            nombre_archivo: string | null;
            vista_en: Date | null;
            ultima_apertura_en: Date | null;
            veces_vista: number | null;
        }>>(
            `SELECT l.cuenta_id, l.id AS libreta_id, l.storage_key,
                    l.nombre_archivo,
                    ll.vista_en, ll.ultima_apertura_en, ll.veces_vista
             FROM libretas l
             LEFT JOIN libretas_lecturas ll
                    ON ll.libreta_id = l.id AND ll.lector_id = l.cuenta_id
             WHERE l.tipo = 'padre'
               AND l.periodo_id = $1::uuid
               AND l.cuenta_id = ANY($2::uuid[])`,
            [periodoId, padreIds],
        );
        const propiaPorPadre = new Map(libretasPadre.map(r => [r.cuenta_id, r]));

        // 2) Hijos del padre (filtrado por sección si aplica) con su libreta del
        //    periodo y la lectura efectuada por el padre.
        const seccionFilter = seccionId ? `AND m.seccion_id = $3::uuid` : '';
        const params: unknown[] = [periodoId, padreIds];
        if (seccionId) params.push(seccionId);

        const filasHijos = await this.dataSource.query<Array<{
            padre_id: string;
            alumno_id: string;
            alumno_nombre: string;
            alumno_apellido_paterno: string;
            alumno_apellido_materno: string | null;
            grado: string | null;
            seccion: string | null;
            libreta_id: string | null;
            storage_key: string | null;
            nombre_archivo: string | null;
            vista_en: Date | null;
            ultima_apertura_en: Date | null;
            veces_vista: number | null;
        }>>(
            `SELECT
                pa.padre_id,
                a.id                                       AS alumno_id,
                a.nombre                                   AS alumno_nombre,
                a.apellido_paterno                         AS alumno_apellido_paterno,
                a.apellido_materno                         AS alumno_apellido_materno,
                g.nombre                                   AS grado,
                s.nombre                                   AS seccion,
                l.id                                       AS libreta_id,
                l.storage_key                              AS storage_key,
                l.nombre_archivo                           AS nombre_archivo,
                ll.vista_en, ll.ultima_apertura_en, ll.veces_vista
             FROM   padre_alumno pa
             JOIN   alumnos      a  ON a.id = pa.alumno_id
             JOIN   matriculas   m  ON m.alumno_id = a.id AND m.activo = TRUE
             LEFT JOIN secciones s  ON s.id = m.seccion_id
             LEFT JOIN grados    g  ON g.id = s.grado_id
             LEFT JOIN libretas  l  ON l.cuenta_id = a.id AND l.tipo = 'alumno'
                                   AND l.periodo_id = $1::uuid
             LEFT JOIN libretas_lecturas ll
                                   ON ll.libreta_id = l.id AND ll.lector_id = pa.padre_id
             WHERE  pa.padre_id = ANY($2::uuid[])
                ${seccionFilter}
             ORDER BY a.apellido_paterno, a.nombre`,
            params,
        );

        const hijosPorPadre = new Map<string, typeof filasHijos>();
        for (const f of filasHijos) {
            const arr = hijosPorPadre.get(f.padre_id) ?? [];
            arr.push(f);
            hijosPorPadre.set(f.padre_id, arr);
        }

        // 3) Componer respuesta por padre con firma de URL on demand.
        return Promise.all(padres.map(async p => {
            const rawPropia = propiaPorPadre.get(p.id);
            const propiaUrl = rawPropia?.storage_key
                ? await this.storageService.getSignedUrl(rawPropia.storage_key)
                : null;

            const hijosRaw = hijosPorPadre.get(p.id) ?? [];
            const hijos = await Promise.all(hijosRaw.map(async h => ({
                alumno_id: h.alumno_id,
                nombre: h.alumno_nombre,
                apellido_paterno: h.alumno_apellido_paterno,
                apellido_materno: h.alumno_apellido_materno,
                grado: h.grado,
                seccion: h.seccion,
                libreta: h.libreta_id && h.storage_key
                    ? {
                        id: h.libreta_id,
                        url: await this.storageService.getSignedUrl(h.storage_key),
                        nombre_archivo: h.nombre_archivo,
                        lectura: h.vista_en ? {
                            vista_en: h.vista_en,
                            ultima_apertura_en: h.ultima_apertura_en!,
                            veces_vista: h.veces_vista ?? 0,
                        } : null,
                    }
                    : null,
            })));

            const hijosCargados = hijos.filter(h => h.libreta !== null).length;
            const hijosLeidos = hijos.filter(h => h.libreta?.lectura).length;

            return {
                id: p.id,
                nombre: p.nombre,
                apellido_paterno: p.apellido_paterno,
                apellido_materno: p.apellido_materno,
                relacion: p.relacion ?? 'padre',
                libreta: rawPropia && propiaUrl ? {
                    id: rawPropia.libreta_id,
                    url: propiaUrl,
                    nombre_archivo: rawPropia.nombre_archivo,
                    lectura: rawPropia.vista_en ? {
                        vista_en: rawPropia.vista_en,
                        ultima_apertura_en: rawPropia.ultima_apertura_en!,
                        veces_vista: rawPropia.veces_vista ?? 0,
                    } : null,
                } : null,
                hijos,
                resumen_lectura: {
                    propia_leida: !!rawPropia?.vista_en,
                    propia_cargada: !!rawPropia,
                    hijos_total: hijos.length,
                    hijos_cargados: hijosCargados,
                    hijos_leidos: hijosLeidos,
                },
            };
        }));
    }

    /** Auditoría: lista de lectores con primera vista, última apertura y conteo. */
    async listLecturas(libretaId: string) {
        return this.dataSource.query<{
            lector_id: string;
            nombre: string | null;
            apellidos: string | null;
            rol: string;
            vista_en: Date;
            ultima_apertura_en: Date;
            veces_vista: number;
        }[]>(
            `SELECT
                ll.lector_id,
                COALESCE(p.nombre, a.nombre)                                   AS nombre,
                CONCAT_WS(' ',
                    COALESCE(p.apellido_paterno, a.apellido_paterno),
                    COALESCE(p.apellido_materno, a.apellido_materno))          AS apellidos,
                c.rol,
                ll.vista_en,
                ll.ultima_apertura_en,
                ll.veces_vista
             FROM libretas_lecturas ll
             JOIN cuentas c ON c.id = ll.lector_id
             LEFT JOIN padres  p ON p.id = c.id
             LEFT JOIN alumnos a ON a.id = c.id
             WHERE ll.libreta_id = $1
             ORDER BY ll.ultima_apertura_en DESC`,
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

    /**
     * Vista unificada del padre: su propia libreta + las libretas de cada hijo
     * vinculado. Marca cada libreta con `leida` (boolean) para que el front
     * sepa cuál mostrar como "Nueva".
     */
    async findPadreCompleto(padreId: string): Promise<{
        propias: Awaited<ReturnType<LibretasService['findByCuenta']>>;
        hijos: Array<{
            alumno_id: string;
            nombre: string;
            apellido_paterno: string;
            apellido_materno: string | null;
            grado: string | null;
            seccion: string | null;
            libretas: Awaited<ReturnType<LibretasService['findByCuenta']>>;
        }>;
    }> {
        // Libretas del padre (tipo=padre)
        const propias = await this.findByCuenta(padreId, 'padre', padreId);

        // Hijos vinculados al padre, con su matrícula activa más reciente
        const hijos = await this.dataSource.query<Array<{
            alumno_id: string;
            nombre: string;
            apellido_paterno: string;
            apellido_materno: string | null;
            grado: string | null;
            seccion: string | null;
        }>>(
            `SELECT
                a.id                AS alumno_id,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                g.nombre            AS grado,
                s.nombre            AS seccion
             FROM padre_alumno pa
             JOIN alumnos     a ON a.id = pa.alumno_id
             LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.activo = TRUE
             LEFT JOIN secciones  s ON s.id = m.seccion_id
             LEFT JOIN grados     g ON g.id = s.grado_id
             WHERE pa.padre_id = $1::uuid
             ORDER BY a.apellido_paterno, a.nombre`,
            [padreId],
        );

        // Para cada hijo, obtengo sus libretas tipo=alumno y marco "leida"
        // contra el padre (no contra el alumno).
        const hijosConLibretas = await Promise.all(
            hijos.map(async (h) => ({
                ...h,
                libretas: await this.findByCuenta(h.alumno_id, 'alumno', padreId),
            })),
        );

        return { propias, hijos: hijosConLibretas };
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
        await this.assertCanManage(dto.subido_por, dto.rol, dto.cuenta_id, dto.tipo, dto.periodo_id);

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
        // Además se bloquea si el año lectivo está archivado.
        const alumnos: AlumnoCandidate[] = await this.dataSource.query(
            `SELECT a.id, a.nombre, a.apellido_paterno, a.apellido_materno
             FROM   matriculas      m
             JOIN   alumnos         a  ON a.id = m.alumno_id
             JOIN   periodos        p  ON p.id = $2::uuid AND p.anio = m.anio
             LEFT JOIN anios_lectivos al ON al.anio = p.anio
             WHERE  m.seccion_id = $1::uuid
               AND  m.activo     = TRUE
               AND  (al.estado IS NULL OR al.estado <> 'archivado')`,
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
        await this.assertCanManage(userId, rol, libreta.cuenta_id, libreta.tipo, libreta.periodo_id);
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
     *
     * Validación escalable: usa el AÑO del periodo de la libreta (no el periodo
     * activo "hoy"), para que sea posible corregir libretas de bimestres pasados
     * mientras el año lectivo no esté archivado. Bloquea ediciones cuando el
     * año lectivo correspondiente está en estado `archivado`.
     */
    private async assertCanManage(
        userId: string,
        rol: string,
        cuentaId: string,
        tipo: LibretaTipo,
        periodoId: string,
    ): Promise<void> {
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

        // El docente debe haber sido tutor de la sección donde el alumno
        // estuvo matriculado durante el AÑO del periodo de la libreta.
        // Se bloquea si el año lectivo correspondiente ya está archivado.
        const ok = await this.dataSource.query(
            `SELECT 1
               FROM periodos        p
               JOIN matriculas      m  ON m.anio       = p.anio
                                      AND m.alumno_id  = $1::uuid
                                      AND m.activo     = TRUE
               JOIN secciones       s  ON s.id         = m.seccion_id
                                      AND s.tutor_id   = $2::uuid
               LEFT JOIN anios_lectivos al ON al.anio  = p.anio
              WHERE p.id = $3::uuid
                AND (al.estado IS NULL OR al.estado <> 'archivado')
              LIMIT 1`,
            [cuentaId, userId, periodoId],
        );
        if (!ok.length) {
            throw new ForbiddenException(
                'Solo el tutor de la sección puede gestionar esta libreta, y el año lectivo no debe estar archivado',
            );
        }
    }
}