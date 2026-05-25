-- ============================================================================
-- Auditoría de lectura de libretas: agrega contador de aperturas y
-- timestamp de la última apertura. La columna `vista_en` se mantiene como
-- "timestamp de la primera vez que se abrió" (idempotente histórica).
-- Idempotente. Owner: eduaula.
-- ============================================================================

ALTER TABLE libretas_lecturas
    ADD COLUMN IF NOT EXISTS veces_vista        INTEGER     NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS ultima_apertura_en TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill seguro: si la columna recién se creó, dejamos `ultima_apertura_en`
-- igual a `vista_en` (única vez registrada).
UPDATE libretas_lecturas
   SET ultima_apertura_en = vista_en
 WHERE ultima_apertura_en = vista_en  -- no-op típico, pero idempotente
    OR ultima_apertura_en < vista_en; -- corrige inconsistencias previas

CREATE INDEX IF NOT EXISTS idx_libretas_lecturas_ultima
    ON libretas_lecturas (ultima_apertura_en DESC);
