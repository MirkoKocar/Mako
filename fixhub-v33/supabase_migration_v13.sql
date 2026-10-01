-- Migración v13
-- Necesaria para el nuevo login con email/contraseña: vincula la cuenta real
-- (Supabase Auth) con el edificio/rol elegido, para no tener que volver a
-- pedir el código de edificio en cada inicio de sesión.

CREATE TABLE IF NOT EXISTS perfiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  rol TEXT NOT NULL, -- 'vecino', 'admin', 'proveedor'
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  persona_id UUID, -- id en la tabla vecinos o proveedores (null para admin)
  pin TEXT, -- solo para admin: permite re-buscar sus edificios sin pedir el PIN de nuevo
  nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE perfiles DISABLE ROW LEVEL SECURITY;

-- Nota: el WhatsApp del proveedor reutiliza la columna 'telefono' que ya
-- existía en la tabla proveedores — no hizo falta agregar una nueva.
