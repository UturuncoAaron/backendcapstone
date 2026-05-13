-- ============================================================================
-- Tracking de "padre/alumno vio la libreta".
-- Una fila por (libreta, lector). Idempotente.
-- Owner: eduaula.
-- ============================================================================

CREATE TABLE IF NOT EXISTS libretas_lecturas (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    libreta_id UUID         NOT NULL REFERENCES libretas(id) ON DELETE CASCADE,
    lector_id  UUID         NOT NULL REFERENCES cuentas(id)  ON DELETE CASCADE,
    vista_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_libretas_lecturas_libreta_lector UNIQUE (libreta_id, lector_id)
);

CREATE INDEX IF NOT EXISTS idx_libretas_lecturas_libreta
    ON libretas_lecturas (libreta_id);

CREATE INDEX IF NOT EXISTS idx_libretas_lecturas_lector
    ON libretas_lecturas (lector_id);
