-- ============================================================================
-- Migración 0001 — Retirar el tipo 'examen' de tareas y notas.
--
-- Contexto:
--   El módulo de exámenes se eliminó (todo es ahora "tarea", con o sin
--   alternativas). Esta migración convierte los registros históricos.
--
-- Idempotente: se puede correr varias veces sin efectos adicionales.
--
-- Cómo ejecutar manualmente (recomendado antes de deployar el backend):
--   psql -U postgres -d eduaula -f migrations/0001_remove_exams.sql
-- ============================================================================

BEGIN;

-- 1) Tareas que estaban marcadas como tipo='examen' pasan a 'tarea'.
UPDATE tareas
SET    tipo = 'tarea'
WHERE  tipo = 'examen';

-- 2) Notas con tipo='examen' (cuando había evaluaciones tipo examen) pasan
--    también a 'tarea'. Si prefieres etiquetarlas como 'practica' o 'proyecto'
--    para conservar trazabilidad de la calificación, ajusta este UPDATE.
UPDATE notas
SET    tipo = 'tarea'
WHERE  tipo = 'examen';

-- 3) (Opcional, no destructivo) — si quisieras endurecer el constraint para
--    impedir que vuelvan a entrar valores 'examen' a futuro:
--
--   ALTER TABLE tareas
--   ADD CONSTRAINT tareas_tipo_chk CHECK (tipo IN ('tarea'));
--
--   ALTER TABLE notas
--   ADD CONSTRAINT notas_tipo_chk CHECK (
--       tipo IN ('tarea','practica','participacion','proyecto','otro')
--   );
--
-- Si tu DB ya tenía un CHECK con 'examen' en la lista, primero hay que
-- borrarlo (`DROP CONSTRAINT ...`) antes de re-crearlo sin 'examen'.

COMMIT;

-- Verificación rápida:
--   SELECT tipo, COUNT(*) FROM tareas GROUP BY tipo;
--   SELECT tipo, COUNT(*) FROM notas  GROUP BY tipo;
