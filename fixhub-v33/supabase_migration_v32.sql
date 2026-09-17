-- ============================================================================
-- FixHub v32 — Doble confirmación, presupuesto y aviso al Tablón
-- ============================================================================
-- CÓMO APLICAR: Supabase → SQL Editor → pegar todo → Run. No rompe nada de
-- lo anterior, solo agrega columnas nuevas con valores por defecto seguros.
-- ============================================================================

-- Doble confirmación de "Resuelto": el vecino y el admin marcan cada uno
-- por su lado: solo cuando los dos confirmaron, el aviso pasa a 'resuelto'.
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS resuelto_vecino BOOLEAN DEFAULT false;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS resuelto_admin  BOOLEAN DEFAULT false;

-- Presupuesto que carga el proveedor para ese trabajo.
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS presupuesto NUMERIC;

-- Para no publicar el mismo aviso dos veces en el Tablón si el vecino
-- edita el reporte antes de elegir proveedor.
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS publicado_tablon BOOLEAN DEFAULT false;

-- ============================================================================
-- FIN
-- ============================================================================
