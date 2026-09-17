-- FixHub v6 — Ejecutar en Supabase SQL Editor

-- Tablas nuevas v6

CREATE TABLE IF NOT EXISTS votaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  opciones JSONB DEFAULT '[]',
  activa BOOLEAN DEFAULT TRUE,
  fecha_limite DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  votacion_id UUID REFERENCES votaciones(id) ON DELETE CASCADE,
  vecino_id UUID REFERENCES vecinos(id),
  edificio_id UUID REFERENCES edificios(id),
  opcion TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS encuestas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  preguntas JSONB DEFAULT '[]',
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS respuestas_encuesta (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  encuesta_id UUID REFERENCES encuestas(id) ON DELETE CASCADE,
  vecino_id UUID REFERENCES vecinos(id),
  edificio_id UUID REFERENCES edificios(id),
  respuestas JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visitas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vecino_id UUID REFERENCES vecinos(id),
  edificio_id UUID REFERENCES edificios(id) ON DELETE CASCADE,
  nombre_visita TEXT NOT NULL,
  fecha DATE NOT NULL,
  nota TEXT,
  departamento TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columna nota interna en mensajes
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS es_nota_interna BOOLEAN DEFAULT FALSE;

-- Columna updated_at en avisos para calcular tiempo de resolución
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Desactivar RLS
ALTER TABLE votaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE votos DISABLE ROW LEVEL SECURITY;
ALTER TABLE encuestas DISABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_encuesta DISABLE ROW LEVEL SECURITY;
ALTER TABLE emergencias DISABLE ROW LEVEL SECURITY;
ALTER TABLE visitas DISABLE ROW LEVEL SECURITY;

-- Permisos
GRANT ALL ON votaciones TO anon;
GRANT ALL ON votos TO anon;
GRANT ALL ON encuestas TO anon;
GRANT ALL ON respuestas_encuesta TO anon;
GRANT ALL ON emergencias TO anon;
GRANT ALL ON visitas TO anon;
