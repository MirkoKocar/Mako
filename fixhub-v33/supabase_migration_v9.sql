-- v9: votaciones en tablón + notificaciones programadas

-- Tipo de contenido en anuncios (aviso, votacion, anuncio)
ALTER TABLE anuncios ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'aviso';
ALTER TABLE anuncios ADD COLUMN IF NOT EXISTS opciones_votacion JSONB;
ALTER TABLE anuncios ADD COLUMN IF NOT EXISTS fecha_publicacion TIMESTAMPTZ DEFAULT NOW();

-- Votos en tablón
CREATE TABLE IF NOT EXISTS votos_tablon (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  anuncio_id UUID REFERENCES anuncios(id) ON DELETE CASCADE,
  vecino_id UUID REFERENCES vecinos(id) ON DELETE CASCADE,
  opcion TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(anuncio_id, vecino_id)
);

-- Notificaciones programadas por INFRA
CREATE TABLE IF NOT EXISTS notificaciones_programadas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  edificio_ids UUID[],         -- null = todos los edificios
  roles TEXT[],                -- ['vecino','admin','proveedor'] o subset
  vecino_ids UUID[],           -- destinatarios específicos
  programada_para TIMESTAMPTZ NOT NULL,
  enviada BOOLEAN DEFAULT FALSE,
  enviada_at TIMESTAMPTZ,
  creada_por TEXT DEFAULT 'INFRA',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para que la Edge Function las encuentre rápido
CREATE INDEX IF NOT EXISTS idx_notif_programadas_pendientes 
  ON notificaciones_programadas(programada_para) 
  WHERE enviada = FALSE;
