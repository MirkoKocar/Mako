-- v7: PIN de admin por edificio + token FCM por usuario

-- Agregar pin_admin a edificios
ALTER TABLE edificios ADD COLUMN IF NOT EXISTS pin_admin VARCHAR(6);

-- Tabla para tokens FCM (notificaciones push)
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  rol TEXT NOT NULL, -- 'vecino', 'admin', 'proveedor'
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
