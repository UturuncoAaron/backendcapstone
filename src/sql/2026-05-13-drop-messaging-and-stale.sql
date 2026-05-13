-- ============================================================================
-- Limpieza:
--  1. Elimina el sub-sistema de mensajería (decisión del producto: solo foros + comunicados).
--  2. Elimina la tabla 'libretas_vistas' (la actual de tracking es 'libretas_lecturas',
--     creada en la migración 2026-05-13-libretas-lecturas.sql).
--  3. Endurece el CHECK del owner_type de attachments para que ya no permita 'message'.
--  4. Quita 'mensaje_nuevo' de los tipos válidos de notificación.
--
-- Idempotente. Owner: eduaula.
-- ============================================================================

BEGIN;

-- 1. Mensajería
DROP TABLE IF EXISTS mensajes CASCADE;
DROP TABLE IF EXISTS conversacion_participantes CASCADE;
DROP TABLE IF EXISTS conversaciones CASCADE;

-- 2. Tabla legacy 'libretas_vistas' (reemplazada por 'libretas_lecturas')
DROP TABLE IF EXISTS libretas_vistas CASCADE;

-- 3. Attachments: cerrar el CHECK para que no acepte 'message'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE constraint_name = 'attachments_owner_type_check'
    ) THEN
        ALTER TABLE attachments DROP CONSTRAINT attachments_owner_type_check;
    END IF;
END $$;

ALTER TABLE attachments
    ADD CONSTRAINT attachments_owner_type_check
    CHECK (owner_type IN ('forum_post','announcement'));

-- Borra cualquier adjunto huérfano de mensajes (si quedó alguno)
DELETE FROM attachments WHERE owner_type = 'message';

-- 4. Notificaciones: no más 'mensaje_nuevo'
-- (Las notificaciones existentes con tipo 'mensaje_nuevo' se borran porque ya
-- no hay UI para abrirlas.)
DELETE FROM notificaciones WHERE tipo = 'mensaje_nuevo';

COMMIT;
