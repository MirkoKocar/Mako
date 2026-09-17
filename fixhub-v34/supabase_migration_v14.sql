-- Migración v14
-- Agrega todo lo necesario para que el chat se sienta como una app de
-- mensajería real: fotos (cámara o galería), mensajes editados, doble check
-- de leído, y responder citando un mensaje anterior.

ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS editado BOOLEAN DEFAULT FALSE;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS leido BOOLEAN DEFAULT FALSE;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS respuesta_a UUID REFERENCES mensajes(id) ON DELETE SET NULL;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS imagen_url TEXT;

-- Bucket de Storage para las fotos del chat (lectura pública, cualquiera puede
-- subir — igual que el resto del proyecto, sin RLS restrictivo)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-imagenes', 'chat-imagenes', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Lectura publica chat imagenes" ON storage.objects;
CREATE POLICY "Lectura publica chat imagenes" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-imagenes');

DROP POLICY IF EXISTS "Subida publica chat imagenes" ON storage.objects;
CREATE POLICY "Subida publica chat imagenes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-imagenes');
