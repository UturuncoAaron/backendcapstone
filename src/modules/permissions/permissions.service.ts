import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermisoExtra } from './entities/permissions.entity.js';
import { CreatePermisoDto, UpdatePermisoDto } from './dto/permissions.dto.js';

@Injectable()
export class PermissionsService {

    constructor(
        @InjectRepository(PermisoExtra)
        private readonly repo: Repository<PermisoExtra>,
    ) { }

    // ── Verificación rápida (hot path — llamado en cada request que lo necesite) ──
    async hasPermiso(cuentaId: string, modulo: string, accion: string): Promise<boolean> {
        const count = await this.repo.count({
            where: { cuentaId, modulo, accion, activo: true },
        });
        return count > 0;
    }

    async assertPermiso(cuentaId: string, modulo: string, accion: string): Promise<void> {
        const tiene = await this.hasPermiso(cuentaId, modulo, accion);
        if (!tiene) {
            throw new ForbiddenException(
                `Sin permiso para accion "${accion}" en módulo "${modulo}"`,
            );
        }
    }

    // ── CRUD (solo admin/director) ────────────────────────────────────────────
    async create(dto: CreatePermisoDto, otorgadoPorId: string): Promise<PermisoExtra> {
        const existing = await this.repo.findOne({
            where: { cuentaId: dto.cuentaId, modulo: dto.modulo, accion: dto.accion },
        });

        // Si ya existe pero está inactivo, reactivar en vez de duplicar
        if (existing) {
            existing.activo = true;
            existing.otorgadoPorId = otorgadoPorId;
            return this.repo.save(existing);
        }

        const permiso = this.repo.create({ ...dto, otorgadoPorId });
        return this.repo.save(permiso);
    }

    async findByCuenta(cuentaId: string): Promise<PermisoExtra[]> {
        return this.repo.find({
            where: { cuentaId, activo: true },
            order: { modulo: 'ASC', accion: 'ASC' },
        });
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

    async remove(id: string): Promise<void> {
        const permiso = await this.repo.findOne({ where: { id } });
        if (!permiso) throw new NotFoundException('Permiso no encontrado');
        // Soft delete — marcar inactivo en vez de borrar físicamente
        permiso.activo = false;
        await this.repo.save(permiso);
    }
}