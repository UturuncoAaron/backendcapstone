import {
    Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Libreta, LibretaTipo } from './entities/libreta.entity.js';
import { StorageService } from '../storage/storage.service.js';

interface UpsertLibretaDto {
    cuenta_id: string;
    tipo: LibretaTipo;
    periodo_id: number;
    subido_por: string;
    rol: string;
    observaciones?: string;
    file: { buffer: Buffer; originalname: string; mimetype: string };
}

@Injectable()
export class LibretasService {
    private readonly logger = new Logger(LibretasService.name);

    constructor(
        @InjectRepository(Libreta)
        private readonly libretaRepo: Repository<Libreta>,
        private readonly storageService: StorageService,
        private readonly dataSource: DataSource,
    ) { }

    // ──────────────────── LECTURA ───────────────────────────────

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

    // ──────────────────── ESCRITURA ─────────────────────────────

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

    async remove(id: string, userId: string, rol: string) {
        const libreta = await this.libretaRepo.findOne({ where: { id } });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        await this.assertCanManage(userId, rol, libreta.cuenta_id, libreta.tipo);

        await this.storageService.deleteFile(libreta.storage_key).catch(() => null);
        await this.libretaRepo.remove(libreta);
        return { message: 'Libreta eliminada correctamente' };
    }

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
