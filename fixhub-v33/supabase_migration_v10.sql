-- Migración v10
-- Necesaria para la v24 de FixHub: permite programar publicaciones del Tablón
-- (avisos/votaciones) para una fecha y hora futuras. El cron de Netlify
-- (scheduled-notifications) revisa esta columna cada 5 minutos y dispara
-- la notificación push exactamente cuando corresponde.

ALTER TABLE anuncios ADD COLUMN IF NOT EXISTS notificado BOOLEAN DEFAULT TRUE;

-- Publicaciones ya existentes: se consideran ya notificadas (no se re-envían)
UPDATE anuncios SET notificado = TRUE WHERE notificado IS NULL;

CREATE INDEX IF NOT EXISTS idx_anuncios_pendientes
  ON anuncios(fecha_publicacion)
  WHERE notificado = FALSE;
