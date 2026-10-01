-- v8: reacciones al tablón + chat admin-vecino + estado pendiente en avisos

-- Reacciones a anuncios (👍 del vecino)
CREATE TABLE IF NOT EXISTS reacciones_anuncio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  anuncio_id UUID REFERENCES anuncios(id) ON DELETE CASCADE,
  vecino_id UUID REFERENCES vecinos(id) ON DELETE CASCADE,
  tipo TEXT DEFAULT 'like',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(anuncio_id, vecino_id)
);

-- Chat privado admin-vecino (para respuestas a anuncios y avisos "Otro")
CREATE TABLE IF NOT EXISTS mensajes_privados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  vecino_id UUID REFERENCES vecinos(id) ON DELETE CASCADE,
  anuncio_id UUID REFERENCES anuncios(id) ON DELETE SET NULL,
  aviso_id UUID REFERENCES avisos(id) ON DELETE SET NULL,
  autor TEXT NOT NULL, -- 'vecino' o 'admin'
  contenido TEXT NOT NULL,
  leido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Estado 'pendiente' para avisos que esperan aprobación del admin (tipo "Otro")
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS pendiente_aprobacion BOOLEAN DEFAULT FALSE;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
