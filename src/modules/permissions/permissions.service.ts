import {
    Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PermisoExtra } from './entities/permissions.entity.js';
import { CreatePermisoDto, UpdatePermisoDto } from './dto/permissions.dto.js';

@Injectable()
export class PermissionsService {

    // ── Caché en memoria ──────────────────────────────────────────
    // Clave: "cuentaId:modulo:accion" → { value, expiresAt }
    // TTL 90 s: suficiente para un colegio; se invalida de inmediato
    // al otorgar/revocar, así que nunca hay lecturas "sucias".
    private cache = new Map<string, { value: boolean; expiresAt: number }>();
    private readonly TTL_MS = 90_000;

    constructor(
        @InjectRepository(PermisoExtra)
        private readonly repo: Repository<PermisoExtra>,
        @InjectDataSource()
        private readonly ds: DataSource,
    ) { }

    // ── Helpers de caché ─────────────────────────────────────────

    private cacheKey(cuentaId: string, modulo: string, accion: string) {
        return `${cuentaId}:${modulo}:${accion}`;
    }

    private invalidateCache(cuentaId: string, modulo: string, accion: string) {
        this.cache.delete(this.cacheKey(cuentaId, modulo, accion));
    }

    private async insertLog(
        cuentaId: string,
        modulo: string,
        accion: string,
        operacion: 'otorgar' | 'revocar',
        hechoBy: string,
    ) {
        await this.ds.query(
            `INSERT INTO log_permisos (cuenta_id, modulo, accion, operacion, hecho_por)
       VALUES ($1, $2, $3, $4, $5)`,
            [cuentaId, modulo, accion, operacion, hechoBy],
        );
    }

    // ── Verificación rápida (hot path) ────────────────────────────

    async hasPermiso(cuentaId: string, modulo: string, accion: string): Promise<boolean> {
        const key = this.cacheKey(cuentaId, modulo, accion);
        const cached = this.cache.get(key);
        if (cached && Date.now() < cached.expiresAt) return cached.value;

        const count = await this.repo.count({
            where: { cuentaId, modulo, accion, activo: true },
        });
        const value = count > 0;
        this.cache.set(key, { value, expiresAt: Date.now() + this.TTL_MS });
        return value;
    }

    async assertPermiso(cuentaId: string, modulo: string, accion: string): Promise<void> {
        const tiene = await this.hasPermiso(cuentaId, modulo, accion);
        if (!tiene) {
            throw new ForbiddenException(
                `Sin permiso para "${accion}" en módulo "${modulo}"`,
            );
        }
    }

    // ── CRUD ──────────────────────────────────────────────────────

    async create(dto: CreatePermisoDto, otorgadoPorId: string): Promise<PermisoExtra> {
        const existing = await this.repo.findOne({
            where: { cuentaId: dto.cuentaId, modulo: dto.modulo, accion: dto.accion },
        });

        if (existing) {
            // Reactivar si estaba inactivo, en vez de duplicar
            existing.activo = true;
            existing.otorgadoPorId = otorgadoPorId;
            const saved = await this.repo.save(existing);
            await this.insertLog(dto.cuentaId, dto.modulo, dto.accion, 'otorgar', otorgadoPorId);
            this.invalidateCache(dto.cuentaId, dto.modulo, dto.accion);
            return saved;
        }

        const permiso = this.repo.create({ ...dto, otorgadoPorId });
        const saved = await this.repo.save(permiso);
        await this.insertLog(dto.cuentaId, dto.modulo, dto.accion, 'otorgar', otorgadoPorId);
        this.invalidateCache(dto.cuentaId, dto.modulo, dto.accion);
        return saved;
    }

    /**
     * Devuelve los permisos activos de una cuenta con info de auditoría:
     * quién otorgó + cuándo + última operación del log.
     * Usado por el diálogo de gestión de permisos.
     */
    async findByCuenta(cuentaId: string) {
        return this.ds.query(
            `SELECT
         pe.id,
         pe.cuenta_id          AS "cuentaId",
         pe.modulo,
         pe.accion,
         pe.activo,
         pe.created_at         AS "createdAt",
         COALESCE(
           adm.nombre || ' ' || adm.apellido_paterno,
           psi.nombre || ' ' || psi.apellido_paterno,
           doc.nombre || ' ' || doc.apellido_paterno,
           aux.nombre || ' ' || aux.apellido_paterno
         )                     AS "otorgadoPorNombre",
         (SELECT operacion
          FROM   log_permisos lp
          WHERE  lp.cuenta_id = pe.cuenta_id
            AND  lp.modulo    = pe.modulo
            AND  lp.accion    = pe.accion
          ORDER  BY lp.created_at DESC
          LIMIT  1)            AS "ultimaOperacion"
       FROM  permisos_extra pe
       LEFT  JOIN admins     adm ON adm.id = pe.otorgado_por
       LEFT  JOIN psicologas psi ON psi.id = pe.otorgado_por
       LEFT  JOIN docentes   doc ON doc.id = pe.otorgado_por
       LEFT  JOIN auxiliares aux ON aux.id = pe.otorgado_por
       WHERE  pe.cuenta_id = $1
         AND  pe.activo    = TRUE
       ORDER  BY pe.modulo, pe.accion`,
            [cuentaId],
        );
    }

    async findAll(): Promise<PermisoExtra[]> {
        return this.repo.find({
            where: { activo: true },
            relations: ['cuenta', 'otorgadoPor'],
            order: { modulo: 'ASC' },
        });
    }

    async update(id: string, dto: UpdatePermisoDto): Promise<PermisoExtra> {
        const permiso = await this.repo.findOne({ where: { id } });
        if (!permiso) throw new NotFoundException('Permiso no encontrado');
        permiso.activo = dto.activo;
        return this.repo.save(permiso);
    }

    async remove(id: string, revokedById: string): Promise<void> {
        const permiso = await this.repo.findOne({ where: { id } });
        if (!permiso) throw new NotFoundException('Permiso no encontrado');
        permiso.activo = false;
        await this.repo.save(permiso);
        await this.insertLog(permiso.cuentaId, permiso.modulo, permiso.accion, 'revocar', revokedById);
        this.invalidateCache(permiso.cuentaId, permiso.modulo, permiso.accion);
    }
}