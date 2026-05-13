-- ============================================================================
-- Adjuntos polimórficos: foros, mensajes y comunicados.
-- Limite duro: 10 MB por archivo (CHECK en BD para defensa en profundidad).
-- Idempotente. Owner: eduaula.
-- ============================================================================

CREATE TABLE IF NOT EXISTS attachments (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type    VARCHAR(30)  NOT NULL CHECK (owner_type IN ('forum_post','message','announcement')),
    owner_id      UUID         NOT NULL,
    storage_key   TEXT         NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type     VARCHAR(150) NOT NULL,
    size_bytes    INTEGER      NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    uploaded_by   UUID         NOT NULL REFERENCES cuentas(id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_owner
    ON attachments (owner_type, owner_id);

CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by
    ON attachments (uploaded_by);
