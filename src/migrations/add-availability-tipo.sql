-- Migration: add-availability-tipo
-- Adds 'tipo' and 'fecha_especifica' columns to disponibilidad_cuenta
-- to support weekly-recurring vs. one-specific-date availability blocks.
--
-- tipo = 'weekly'   → repeats every week on dia_semana (existing behavior, default)
-- tipo = 'specific' → applies only on the exact date in fecha_especifica
--
-- Rule: if ANY specific block exists for a day in a given week,
--       ALL weekly blocks for that same day in that week are ignored.

ALTER TABLE disponibilidad_cuenta
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS fecha_especifica DATE NULL;

CREATE INDEX IF NOT EXISTS idx_disp_cuenta_especifica
  ON disponibilidad_cuenta (cuenta_id, fecha_especifica)
  WHERE fecha_especifica IS NOT NULL;
