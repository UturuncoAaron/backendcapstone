import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SemanaConfig } from './entities/semana-config.entity.js';
import { ToggleSemanaDto, UpdateSemanaDto } from './dto/semanas.dto.js';

/** Cantidad de semanas por curso. Configurable en un solo lugar. */
export const SEMANAS_POR_CURSO = 16;

export interface SemanaResumen {
    semana: number;
    bimestre: number;
    oculta: boolean;
    descripcion: string | null;
    config_id: string | null;
}

@Injectable()
export class SemanasService {
    constructor(
        @InjectRepository(SemanaConfig)
        private readonly repo: Repository<SemanaConfig>,
    ) { }

    /** Devuelve las N semanas del curso, mezclando con la config persistida. */
    async listForCourse(cursoId: string): Promise<SemanaResumen[]> {
        const configs = await this.repo.find({ where: { curso_id: cursoId } });
        const byNumero = new Map(configs.map((c) => [c.semana, c]));

        return Array.from({ length: SEMANAS_POR_CURSO }, (_, i) => {
            const numero = i + 1;
            const cfg = byNumero.get(numero);
            return {
                semana: numero,
                bimestre: Math.ceil(numero / 4),
                oculta: cfg?.oculta ?? false,
                descripcion: cfg?.descripcion ?? null,
                config_id: cfg?.id ?? null,
            };
        });
    }

    /** Lista los números de semana ocultas para un curso. Útil para filtrar items. */
    async getHiddenSemanas(cursoId: string): Promise<number[]> {
        const ocultas = await this.repo.find({
            where: { curso_id: cursoId, oculta: true },
            select: ['semana'],
        });
        return ocultas.map((c) => c.semana);
    }

    async toggle(cursoId: string, semana: number, dto: ToggleSemanaDto): Promise<SemanaResumen> {
        const cfg = await this.upsert(cursoId, semana, { oculta: dto.oculta });
        return this.toResumen(cfg);
    }

    async update(cursoId: string, semana: number, dto: UpdateSemanaDto): Promise<SemanaResumen> {
        const cfg = await this.upsert(cursoId, semana, dto);
        return this.toResumen(cfg);
    }

    private async upsert(
        cursoId: string,
        semana: number,
        partial: Partial<Pick<SemanaConfig, 'oculta' | 'descripcion'>>,
    ): Promise<SemanaConfig> {
        let cfg = await this.repo.findOne({
            where: { curso_id: cursoId, semana },
        });

        if (!cfg) {
            cfg = this.repo.create({
                curso_id: cursoId,
                semana,
                bimestre: Math.ceil(semana / 4),
                oculta: false,
                descripcion: null,
            });
        }

        if (partial.oculta !== undefined) cfg.oculta = partial.oculta;
        if (partial.descripcion !== undefined) cfg.descripcion = partial.descripcion ?? null;

        return this.repo.save(cfg);
    }

    private toResumen(cfg: SemanaConfig): SemanaResumen {
        return {
            semana: cfg.semana,
            bimestre: cfg.bimestre,
            oculta: cfg.oculta,
            descripcion: cfg.descripcion,
            config_id: cfg.id,
        };
    }
}
