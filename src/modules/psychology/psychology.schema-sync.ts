// psychology/psychology.schema-sync.ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class PsychologySchemaSync implements OnApplicationBootstrap {
    private readonly logger = new Logger(PsychologySchemaSync.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.ensureInformesTable();
            await this.ensureInformesConstraints();
            await this.ensureInformesIndexes();
            await this.ensureFirmaColumn();
            await this.ensureArchivosTable();
            this.logger.log('Psychology schema sincronizado');
        } catch (err) {
            this.logger.error(
                'Falla en psychology schema-sync — revisar BD a mano',
                err instanceof Error ? err.stack : String(err),
            );
        }
    }

    // ── informes_psicologicos ───────────────────────────────────────────────

    private async ensureInformesTable(): Promise<void> {
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
            EXCEPTION WHEN undefined_table THEN NULL;
            END $$;
        `);
    }

    private async ensureInformesConstraints(): Promise<void> {
        await this.dataSource.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'informes_psic_tipo_check'
                ) THEN
                    ALTER TABLE informes_psicologicos
                    ADD CONSTRAINT informes_psic_tipo_check
                    CHECK (tipo IN (
                        'evaluacion','seguimiento',
                        'derivacion_familia','derivacion_externa'
                    ));
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'informes_psic_estado_check'
                ) THEN
                    ALTER TABLE informes_psicologicos
                    ADD CONSTRAINT informes_psic_estado_check
                    CHECK (estado IN ('borrador','finalizado'));
                END IF;
            END $$;
        `);
    }

    private async ensureInformesIndexes(): Promise<void> {
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

    // ── firma en psicologas ─────────────────────────────────────────────────

    private async ensureFirmaColumn(): Promise<void> {
        await this.dataSource.query(`
            ALTER TABLE psicologas
            ADD COLUMN IF NOT EXISTS firma_storage_key TEXT
        `);
    }

    // ── psychology_archivos ─────────────────────────────────────────────────

    private async ensureArchivosTable(): Promise<void> {
        await this.dataSource.query(`
            CREATE TABLE IF NOT EXISTS psychology_archivos (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                psicologa_id    UUID NOT NULL,
                alumno_id       UUID NOT NULL,
                categoria       VARCHAR(10) NOT NULL,
                nombre          VARCHAR(255) NOT NULL,
                descripcion     TEXT,
                storage_key     TEXT NOT NULL,
                nombre_original VARCHAR(255),
                mime_type       TEXT,
                size_bytes      INTEGER,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await this.dataSource.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'fk_psych_arch_psicologa'
                ) THEN
                    ALTER TABLE psychology_archivos
                    ADD CONSTRAINT fk_psych_arch_psicologa
                    FOREIGN KEY (psicologa_id) REFERENCES psicologas(id)
                    ON DELETE RESTRICT;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'fk_psych_arch_alumno'
                ) THEN
                    ALTER TABLE psychology_archivos
                    ADD CONSTRAINT fk_psych_arch_alumno
                    FOREIGN KEY (alumno_id) REFERENCES alumnos(id)
                    ON DELETE CASCADE;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'psych_arch_categoria_check'
                ) THEN
                    ALTER TABLE psychology_archivos
                    ADD CONSTRAINT psych_arch_categoria_check
                    CHECK (categoria IN ('ficha', 'test'));
                END IF;
            EXCEPTION WHEN undefined_table THEN NULL;
            END $$;
        `);
        await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_psych_arch_alumno_cat
                ON psychology_archivos (alumno_id, categoria, created_at DESC)
        `);
        await this.dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_psych_arch_psicologa
                ON psychology_archivos (psicologa_id, created_at DESC)
        `);
    }
}