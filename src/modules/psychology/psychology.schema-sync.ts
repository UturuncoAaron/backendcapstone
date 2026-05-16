import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Crea / sincroniza la tabla `informes_psicologicos` idempotentemente.
 * El proyecto no usa migraciones de TypeORM (synchronize: false), por lo
 * que el contrato de esquema vive en estos schema-sync que corren una vez
 * al bootstrap.
 *
 * Diseño:
 *  - PK uuid, FKs a `cuentas` (psicologa) y `alumnos`.
 *  - `tipo` y `estado` quedan como VARCHAR + CHECK, no como ENUM nativo de
 *    Postgres, para que agregar tipos nuevos no requiera ALTER TYPE.
 *  - Índices compuestos (alumno+created, psicologa+created) cubren los
 *    listados típicos. Crecen O(N) con ~600 alumnos/año.
 */
@Injectable()
export class PsychologySchemaSync implements OnApplicationBootstrap {
    private readonly logger = new Logger(PsychologySchemaSync.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.ensureTable();
            await this.ensureConstraints();
            await this.ensureIndexes();
            this.logger.log('informes_psicologicos sincronizado');
        } catch (err) {
            this.logger.error(
                'Falla creando informes_psicologicos — revisar BD a mano',
                err instanceof Error ? err.stack : String(err),
            );
        }
    }

    private async ensureTable(): Promise<void> {
        await this.dataSource.query(`
            CREATE TABLE IF NOT EXISTS informes_psicologicos (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                psicologa_id    UUID NOT NULL,
                alumno_id       UUID NOT NULL,
                tipo            VARCHAR(32) NOT NULL,
                titulo          VARCHAR(200) NOT NULL,
                motivo          TEXT NOT NULL,
                antecedentes    TEXT,
                observaciones   TEXT NOT NULL,
                recomendaciones TEXT,
                derivado_a      TEXT,
                estado          VARCHAR(16) NOT NULL DEFAULT 'borrador',
                confidencial    BOOLEAN NOT NULL DEFAULT TRUE,
                finalizado_at   TIMESTAMPTZ,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        // FKs sólo si las tablas existen (los tests sin schema completo no fallan).
        await this.dataSource.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'fk_informes_psic_psicologa'
                ) THEN
                    ALTER TABLE informes_psicologicos
                    ADD CONSTRAINT fk_informes_psic_psicologa
                    FOREIGN KEY (psicologa_id) REFERENCES psicologas(id)
                    ON DELETE RESTRICT;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'fk_informes_psic_alumno'
                ) THEN
                    ALTER TABLE informes_psicologicos
                    ADD CONSTRAINT fk_informes_psic_alumno
                    FOREIGN KEY (alumno_id) REFERENCES alumnos(id)
                    ON DELETE CASCADE;
                END IF;
            EXCEPTION WHEN undefined_table THEN
                -- En entornos donde psicologas/alumnos aún no existe (tests),
                -- ignoramos sin tirar el bootstrap.
                NULL;
            END $$;
        `);
    }

    private async ensureConstraints(): Promise<void> {
        // CHECKs en tipo y estado — agregar valores nuevos es un simple
        // ALTER TABLE DROP + ADD CONSTRAINT en el siguiente schema-sync.
        await this.dataSource.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'informes_psic_tipo_check'
                ) THEN
                    ALTER TABLE informes_psicologicos
                    ADD CONSTRAINT informes_psic_tipo_check
                    CHECK (tipo IN (
                        'evaluacion','seguimiento',
                        'derivacion_familia','derivacion_externa'
                    ));
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'informes_psic_estado_check'
                ) THEN
                    ALTER TABLE informes_psicologicos
                    ADD CONSTRAINT informes_psic_estado_check
                    CHECK (estado IN ('borrador','finalizado'));
                END IF;
            END $$;
        `);
    }

    private async ensureIndexes(): Promise<void> {
        await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_informes_psic_alumno_created
                ON informes_psicologicos (alumno_id, created_at DESC)
        `);
        await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_informes_psic_psicologa_created
                ON informes_psicologicos (psicologa_id, created_at DESC)
        `);
        await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_informes_psic_estado
                ON informes_psicologicos (estado)
                WHERE estado = 'borrador'
        `);
    }
}
