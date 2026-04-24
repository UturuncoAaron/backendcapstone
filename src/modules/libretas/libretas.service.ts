import {
    Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Libreta } from './entities/libreta.entity.js';
import { StorageService } from '../storage/storage.service.js';

interface UpsertLibretaDto {
    alumno_id: string;
    periodo_id: number;
    subido_por: string;
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

    // Alumno ve sus propias libretas (todos los bimestres)
    async findByAlumno(alumnoId: string) {
        const libretas = await this.libretaRepo.find({
            where: { alumno_id: alumnoId },
            relations: ['periodo'],
            order: { periodo: { anio: 'DESC', bimestre: 'DESC' } },
        });

        return Promise.all(libretas.map(async (l) => ({
            ...l,
            url: await this.storageService.getSignedUrl(l.storage_key),
        })));
    }

    // Padre ve libretas de un hijo específico
    // (la validación de que el padre es dueño del alumno se hace en el controller)
    async findByAlumnoForPadre(padreId: string, alumnoId: string) {
        // Verificar vínculo padre-alumno
        const vinculo = await this.dataSource.query(
            `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2`,
            [padreId, alumnoId],
        );
        if (!vinculo.length) {
            throw new ForbiddenException('No tienes acceso a las libretas de este alumno');
        }

        return this.findByAlumno(alumnoId);
    }

    // Admin/docente lista libretas de un alumno por periodo
    async findByAlumnoAndPeriodo(alumnoId: string, periodoId: number) {
        const libreta = await this.libretaRepo.findOne({
            where: { alumno_id: alumnoId, periodo_id: periodoId },
            relations: ['alumno', 'periodo'],
        });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        return {
            ...libreta,
            url: await this.storageService.getSignedUrl(libreta.storage_key),
        };
    }

    // Subir o reemplazar libreta (admin/docente)
    async upsert(dto: UpsertLibretaDto) {
        const existing = await this.libretaRepo.findOne({
            where: { alumno_id: dto.alumno_id, periodo_id: dto.periodo_id },
        });

        // Si ya existe, borrar archivo anterior de R2
        if (existing) {
            await this.storageService.deleteFile(existing.storage_key).catch(() => null);
        }

        const storage_key = await this.storageService.uploadFile(
            dto.file,
            `libretas/${dto.alumno_id}/periodo-${dto.periodo_id}`,
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
                relations: ['alumno', 'periodo'],
            });
        }

        const libreta = this.libretaRepo.create({
            alumno_id: dto.alumno_id,
            periodo_id: dto.periodo_id,
            storage_key,
            nombre_archivo: dto.file.originalname,
            subido_por: dto.subido_por,
            observaciones: dto.observaciones ?? null,
        });

        return this.libretaRepo.save(libreta);
    }

    // Eliminar libreta (admin siempre, docente solo si la subió él)
    async remove(id: string, userId: string, rol: string) {
        const libreta = await this.libretaRepo.findOne({ where: { id } });
        if (!libreta) throw new NotFoundException('Libreta no encontrada');

        if (rol === 'docente' && libreta.subido_por !== userId) {
            throw new ForbiddenException('No tienes permiso para eliminar esta libreta');
        }

        await this.storageService.deleteFile(libreta.storage_key).catch(() => null);
        await this.libretaRepo.remove(libreta);
        return { message: 'Libreta eliminada correctamente' };
    }
}