import {
    Injectable, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SemanaConfig } from './entities/semana-config.entity.js';
import { ToggleSemanaDto, UpdateSemanaDto } from './dto/semanas.dto.js';

/** Máximo de semanas permitido por curso. */
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

    async listForCourse(cursoId: string): Promise<SemanaResumen[]> {
        const configs = await this.repo.find({
            where: { curso_id: cursoId },
            order: { semana: 'ASC' },
        });

        if (configs.length === 0) {
            return [
                {
                    semana: 1,
                    bimestre: 1,
                    oculta: false,
                    descripcion: null,
                    config_id: null,
                },
            ];
        }

        const maxSemana = Math.max(...configs.map(c => c.semana));
        const byNumero = new Map(configs.map(c => [c.semana, c]));

        return Array.from({ length: maxSemana }, (_, i) => {
            const numero = i + 1;
            const cfg = byNumero.get(numero);
            return {
                semana: numero,
                bimestre: cfg?.bimestre ?? this.inferBimestre(numero, byNumero),
                oculta: cfg?.oculta ?? false,
                descripcion: cfg?.descripcion ?? null,
                config_id: cfg?.id ?? null,
            };
        });
    }

    /** Infiere bimestre para huecos buscando la config anterior más cercana. */
    private inferBimestre(
        semana: number,
        byNumero: Map<number, SemanaConfig>,
    ): number {
        for (let s = semana - 1; s >= 1; s--) {
            const cfg = byNumero.get(s);
            if (cfg) return cfg.bimestre;
        }
        return 1;
    }

    async addNextSemana(cursoId: string, bimestre: number): Promise<SemanaResumen> {
        const configs = await this.repo.find({ where: { curso_id: cursoId } });
        const maxExistente = configs.length > 0
            ? Math.max(...configs.map(c => c.semana))
            : 0;

        const nextSemana = maxExistente + 1;

        if (nextSemana > SEMANAS_POR_CURSO) {
            throw new BadRequestException(
                `Ya se alcanzó el máximo de ${SEMANAS_POR_CURSO} semanas para este curso.`,
            );
        }

        // Idempotente frente a doble click
        const existing = await this.repo.findOne({
            where: { curso_id: cursoId, semana: nextSemana },
        });
        if (existing) return this.toResumen(existing);

        const cfg = this.repo.create({
            curso_id: cursoId,
            semana: nextSemana,
            bimestre,           // ← viene del frontend, no calculado
            oculta: false,
            descripcion: null,
        });

        const saved = await this.repo.save(cfg);
        return this.toResumen(saved);
    }

    /** Números de semanas ocultas para un curso. Útil para filtrar items. */
    async getHiddenSemanas(cursoId: string): Promise<number[]> {
        const ocultas = await this.repo.find({
            where: { curso_id: cursoId, oculta: true },
            select: ['semana'],
        });
        return ocultas.map(c => c.semana);
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
        let cfg = await this.repo.findOne({ where: { curso_id: cursoId, semana } });

        if (!cfg) {
            // Para upserts de semanas sin config aún, inferimos bimestre
            // de la semana anterior si existe
            const anterior = await this.repo.findOne({
                where: { curso_id: cursoId },
                order: { semana: 'DESC' },
            });
            cfg = this.repo.create({
                curso_id: cursoId,
                semana,
                bimestre: anterior?.bimestre ?? Math.ceil(semana / 4),
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