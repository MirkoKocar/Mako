-- FixHub v5 — Ejecutar en Supabase SQL Editor

-- Tabla anuncios (tablón)
CREATE TABLE IF NOT EXISTS anuncios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  prioridad TEXT DEFAULT 'normal',
  autor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla reservas
CREATE TABLE IF NOT EXISTS reservas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vecino_id UUID REFERENCES vecinos(id),
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  espacio TEXT NOT NULL,
  espacio_nombre TEXT,
  fecha DATE NOT NULL,
  hora TIME,
  departamento TEXT,
  estado TEXT DEFAULT 'confirmada',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla recordatorios de mantenimiento
CREATE TABLE IF NOT EXISTS recordatorios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  fecha DATE NOT NULL,
  nota TEXT,
  completado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla agenda del proveedor
CREATE TABLE IF NOT EXISTS agenda_proveedor (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME,
  nota TEXT,
  completado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Desactivar RLS en todas
ALTER TABLE anuncios DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservas DISABLE ROW LEVEL SECURITY;
ALTER TABLE recordatorios DISABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_proveedor DISABLE ROW LEVEL SECURITY;

-- Permisos
GRANT ALL ON anuncios TO anon;
GRANT ALL ON reservas TO anon;
GRANT ALL ON recordatorios TO anon;
GRANT ALL ON agenda_proveedor TO anon;
