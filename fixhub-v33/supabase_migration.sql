-- FixHub v4 — SQL para ejecutar en Supabase SQL Editor

-- Tabla mensajes (si no existe)
CREATE TABLE IF NOT EXISTS mensajes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aviso_id UUID REFERENCES avisos(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  remitente_rol TEXT NOT NULL CHECK (remitente_rol IN ('vecino', 'admin', 'proveedor')),
  remitente_id UUID,
  vecino_id UUID REFERENCES vecinos(id),
  proveedor_id UUID REFERENCES proveedores(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columnas faltantes en proveedores
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ranking INTEGER DEFAULT 50;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT TRUE;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS especialidad TEXT;

-- Columnas faltantes en avisos
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS urgencia TEXT DEFAULT 'media';
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES proveedores(id);

-- Columna admin_pin en edificios
ALTER TABLE edificios ADD COLUMN IF NOT EXISTS admin_pin TEXT;

-- Habilitar Realtime en mensajes (correr en Supabase Dashboard > Database > Replication)
-- ALTER PUBLICATION supabase_realtime ADD TABLE mensajes;

-- Desactivar RLS en todas las tablas
ALTER TABLE edificios DISABLE ROW LEVEL SECURITY;
ALTER TABLE vecinos DISABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores DISABLE ROW LEVEL SECURITY;
ALTER TABLE avisos DISABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes DISABLE ROW LEVEL SECURITY;
