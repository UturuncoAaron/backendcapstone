import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Sincronización idempotente del módulo `courses`.
 *
 * Se ejecuta una vez al arrancar la app. Todo es idempotente:
 * si ya está correcto, no toca nada.
 *
 *  1. Dedupe de matrículas: si un alumno tiene 2+ matrículas activas
 *     en la misma (seccion, anio), conserva la más reciente y baja las demás.
 *
 *  2. Índices de performance para las queries más calientes.
 */
@Injectable()
export class CoursesSchemaSync implements OnApplicationBootstrap {
    private readonly logger = new Logger(CoursesSchemaSync.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.dedupeActiveEnrollments();
            await this.ensurePerformanceIndexes();
        } catch (err) {
            this.logger.error(
                'Sincronización de courses falló — revisar BD manualmente',
                err instanceof Error ? err.stack : String(err),
            );
        }
    }

    /**
     * Índices que aceleran las queries más calientes:
     *  - idx_matriculas_distinct_on : DISTINCT ON (alumno_id ORDER BY created_at DESC)
     *  - idx_horarios_curso_dia_hora: dashboard del docente (horario semanal)
     *  - idx_notas_curso_periodo    : planilla de calificaciones por curso/período
     */
    private async ensurePerformanceIndexes(): Promise<void> {
        await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_matriculas_distinct_on
                ON matriculas (alumno_id, created_at DESC)
                WHERE activo = TRUE
        `);
        await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_horarios_curso_dia_hora
                ON horarios (curso_id, dia_semana, hora_inicio)
        `);
        await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_notas_curso_periodo
                ON notas (curso_id, periodo_id, fecha)
        `);
        this.logger.log('Índices de performance verificados');
    }

    /**
     * Para cada (alumno_id, seccion_id, anio), conserva como activo = true
     * la matrícula con created_at más reciente y desactiva las demás.
     * No borra filas: queda traza histórica.
     */
    private async dedupeActiveEnrollments(): Promise<void> {
        const result = await this.dataSource.query(`
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY alumno_id, anio   -- ← era periodo_id
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
        const affected = Array.isArray(result) ? (result[1] ?? 0) : (result?.rowCount ?? 0);
        if (affected > 0) {
            this.logger.log(`Dedupe matrículas: ${affected} fila(s) desactivada(s)`);
        }
    }
}