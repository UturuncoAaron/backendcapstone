-- ============================================================================
-- Limpieza:
--  1. Elimina el sub-sistema de mensajería (decisión del producto: solo foros + comunicados).
--  2. Elimina la tabla 'libretas_vistas' (la actual de tracking es 'libretas_lecturas',
--     creada en la migración 2026-05-13-libretas-lecturas.sql).
--  3. Endurece el CHECK del owner_type de attachments para que ya no permita 'message'.
--  4. Quita 'mensaje_nuevo' de los tipos válidos de notificación.
--
-- 100% idempotente y defensivo: cada bloque verifica que la tabla exista
-- antes de tocarla, así se puede correr en bases que todavía no aplicaron
-- migraciones previas (p.ej. 'attachments' o 'notificaciones').
--
-- Owner: eduaula.
-- ============================================================================

BEGIN;

-- 1. Mensajería (siempre seguro con IF EXISTS)
DROP TABLE IF EXISTS mensajes CASCADE;
DROP TABLE IF EXISTS conversacion_participantes CASCADE;
DROP TABLE IF EXISTS conversaciones CASCADE;

-- 2. Tabla legacy 'libretas_vistas' (reemplazada por 'libretas_lecturas')
DROP TABLE IF EXISTS libretas_vistas CASCADE;

-- 3. Attachments: cerrar el CHECK para que no acepte 'message'.
--    Solo si la tabla 'attachments' ya existe (la creó la migración
--    2026-05-13-attachments.sql).
DO $$
BEGIN
    IF to_regclass('public.attachments') IS NOT NULL THEN
        -- Quita el CHECK previo si existe (puede llamarse distinto según versión)
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'attachments_owner_type_check'
              AND conrelid = 'public.attachments'::regclass
        ) THEN
            ALTER TABLE attachments DROP CONSTRAINT attachments_owner_type_check;
        END IF;

        -- Borra huérfanos antes de re-agregar el CHECK más estricto
        DELETE FROM attachments WHERE owner_type = 'message';

        -- Re-crea el CHECK con el set reducido
        ALTER TABLE attachments
            ADD CONSTRAINT attachments_owner_type_check
            CHECK (owner_type IN ('forum_post','announcement'));
    ELSE
        RAISE NOTICE 'Tabla "attachments" no existe todavía — saltado el paso 3. '
                     'Corré primero src/modules/attachments/sql/2026-05-13-attachments.sql.';
    END IF;
END $$;

-- 4. Notificaciones: no más 'mensaje_nuevo'.
--    Las notificaciones existentes con ese tipo se borran porque ya no hay UI
--    que las abra.
DO $$
BEGIN
    IF to_regclass('public.notificaciones') IS NOT NULL THEN
        DELETE FROM notificaciones WHERE tipo = 'mensaje_nuevo';
    ELSE
        RAISE NOTICE 'Tabla "notificaciones" no existe todavía — saltado el paso 4.';
    END IF;
END $$;

COMMIT;
