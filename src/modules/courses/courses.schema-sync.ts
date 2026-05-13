import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Sincronización idempotente del módulo `courses`.
 *
 * Cambios cubiertos:
 *
 *  1. **Dedupe de matrículas históricas**: si un alumno aparece con 2+
 *     matrículas activas en el mismo período (data legacy del bug de
 *     `enrollStudent`), dejamos solo la más reciente activa y bajamos
 *     las demás (`activo = false`). Es idempotente: si no hay duplicados,
 *     no toca nada.
 */
@Injectable()
export class CoursesSchemaSync implements OnApplicationBootstrap {
    private readonly logger = new Logger(CoursesSchemaSync.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.dedupeActiveEnrollments();
        } catch (err) {
            this.logger.error(
                'Sincronización de courses falló — revisar BD manualmente',
                err instanceof Error ? err.stack : String(err),
            );
        }
    }

    /**
     * Para cada (alumno_id, periodo_id), conserva como `activo = true`
     * la matrícula con `created_at` más reciente y desactiva las demás.
     * No borra: queda traza histórica.
     */
    private async dedupeActiveEnrollments(): Promise<void> {
        const result = await this.dataSource.query(`
            WITH ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY alumno_id, periodo_id
                           ORDER BY created_at DESC, id DESC
                       ) AS rn
                FROM matriculas
                WHERE activo = true
            )
            UPDATE matriculas m
               SET activo = false
              FROM ranked r
             WHERE m.id = r.id
               AND r.rn > 1
        `);
        // pg result: [rows[], rowCount]. Para UPDATE rowCount va en [1] o en .rowCount según driver.
        const affected = Array.isArray(result) ? (result[1] ?? 0) : (result?.rowCount ?? 0);
        if (affected > 0) {
            this.logger.log(`Dedupe matrículas: ${affected} fila(s) desactivada(s)`);
        }
    }
}
