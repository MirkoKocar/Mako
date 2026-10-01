-- ============================================================================
-- FixHub v31 — MIGRACIÓN DE SEGURIDAD
-- ============================================================================
-- Qué hace esto:
--  1. Activa Row Level Security (RLS) de verdad en las 20 tablas — hoy
--     cualquiera con la anon key (visible en el navegador de cualquier
--     usuario) puede leer y borrar TODO. Esto lo cierra.
--  2. Mueve la verificación del PIN de admin al servidor (hoy se comparaba
--     en el navegador después de traer el PIN real al cliente).
--  3. Cierra el acceso a INFRA: hoy con escribir la palabra "INFRA" en el
--     login cualquiera entra al panel maestro. Ahora hace falta tener una
--     cuenta real marcada como infra en la base.
--
-- CÓMO APLICAR:
--  1. Andá a Supabase → SQL Editor → pegá este archivo completo → Run.
--  2. Después de correrlo, DECÍME TU EMAIL de la cuenta que usás vos (Mirko)
--     para entrar a la app, y te paso el UPDATE puntual para marcarla como
--     'infra' (no lo hago automático acá para no dejarlo hardcodeado en el
--     repo).
--  3. Probá TODOS los flujos de nuevo después de aplicar esto (vecino,
--     admin, proveedor, INFRA) — RLS puede romper algo que no vimos, por
--     eso conviene probar antes de anunciar el lanzamiento.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1: funciones auxiliares (leen el perfil del usuario logueado una sola
-- vez y las usamos adentro de las políticas — SECURITY DEFINER para poder
-- leer 'perfiles' sin caer en referencias circulares de RLS)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fh_rol() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT rol FROM perfiles WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION fh_edificio_id() RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT edificio_id FROM perfiles WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION fh_persona_id() RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT persona_id FROM perfiles WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- Todos los edificios que administra el usuario logueado (un admin puede
-- tener varios edificios con el mismo PIN)
CREATE OR REPLACE FUNCTION fh_edificios_admin() RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id FROM edificios e
  JOIN perfiles p ON p.pin = e.pin_admin
  WHERE p.auth_user_id = auth.uid() AND p.rol = 'admin' AND p.pin IS NOT NULL
$$;

-- true si el edificio dado es "el mío" (vecino/proveedor de ese edificio, o
-- admin de ese edificio)
CREATE OR REPLACE FUNCTION fh_es_mi_edificio(p_edificio_id UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_edificio_id = fh_edificio_id()
     OR p_edificio_id IN (SELECT fh_edificios_admin())
$$;


-- ----------------------------------------------------------------------------
-- PASO 2: activar RLS en todas las tablas
-- ----------------------------------------------------------------------------
ALTER TABLE edificios                DISABLE ROW LEVEL SECURITY; -- se vuelve a activar abajo, hace falta desactivarla primero para poder recrear políticas limpias en algunos proyectos
ALTER TABLE edificios                ENABLE  ROW LEVEL SECURITY;
ALTER TABLE vecinos                  ENABLE  ROW LEVEL SECURITY;
ALTER TABLE proveedores              ENABLE  ROW LEVEL SECURITY;
ALTER TABLE avisos                   ENABLE  ROW LEVEL SECURITY;
ALTER TABLE mensajes                 ENABLE  ROW LEVEL SECURITY;
ALTER TABLE anuncios                 ENABLE  ROW LEVEL SECURITY;
ALTER TABLE reservas                 ENABLE  ROW LEVEL SECURITY;
ALTER TABLE recordatorios            ENABLE  ROW LEVEL SECURITY;
ALTER TABLE agenda_proveedor         ENABLE  ROW LEVEL SECURITY;
ALTER TABLE votaciones               ENABLE  ROW LEVEL SECURITY;
ALTER TABLE votos                    ENABLE  ROW LEVEL SECURITY;
ALTER TABLE encuestas                ENABLE  ROW LEVEL SECURITY;
ALTER TABLE respuestas_encuesta      ENABLE  ROW LEVEL SECURITY;
ALTER TABLE emergencias              ENABLE  ROW LEVEL SECURITY;
ALTER TABLE visitas                  ENABLE  ROW LEVEL SECURITY;
ALTER TABLE reacciones_anuncio       ENABLE  ROW LEVEL SECURITY;
ALTER TABLE mensajes_privados        ENABLE  ROW LEVEL SECURITY;
ALTER TABLE votos_tablon             ENABLE  ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens               ENABLE  ROW LEVEL SECURITY;
ALTER TABLE notificaciones_programadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles                 ENABLE  ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PASO 3: políticas — perfiles (cada uno ve/edita SOLO su propia fila)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS perfiles_propio ON perfiles;
CREATE POLICY perfiles_propio ON perfiles FOR ALL
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- PASO 4: edificios
-- Ya no se puede hacer SELECT * libre (ahí vivía el pin_admin expuesto).
-- El login usa las funciones RPC del PASO 7 en su lugar.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS edificios_ver_el_mio ON edificios;
CREATE POLICY edificios_ver_el_mio ON edificios FOR SELECT
  USING (fh_es_mi_edificio(id));

-- Nadie inserta/borra/edita edificios desde el cliente — eso lo hace INFRA
-- con la service_role key (Netlify Function), nunca con la anon key.

-- ----------------------------------------------------------------------------
-- PASO 5: tablas "de una persona" — vecinos y proveedores
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS vecinos_ver ON vecinos;
CREATE POLICY vecinos_ver ON vecinos FOR SELECT
  USING (fh_es_mi_edificio(edificio_id) OR id = fh_persona_id());

-- Alta de vecino: solo se permite si el que lo pide ya tiene cuenta real
-- (auth.uid() no es null) y el edificio_id corresponde a un edificio que
-- existe (verificado por FK). Esto reemplaza el auto-registro libre por uno
-- que como mínimo exige tener una cuenta con email/contraseña.
DROP POLICY IF EXISTS vecinos_alta ON vecinos;
CREATE POLICY vecinos_alta ON vecinos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS vecinos_editar ON vecinos;
CREATE POLICY vecinos_editar ON vecinos FOR UPDATE
  USING (fh_es_mi_edificio(edificio_id) OR id = fh_persona_id());

DROP POLICY IF EXISTS proveedores_ver ON proveedores;
CREATE POLICY proveedores_ver ON proveedores FOR SELECT
  USING (fh_es_mi_edificio(edificio_id) OR id = fh_persona_id());

-- Los proveedores los da de alta el admin del edificio (no hay auto-registro
-- de proveedor en la app)
DROP POLICY IF EXISTS proveedores_alta ON proveedores;
CREATE POLICY proveedores_alta ON proveedores FOR INSERT
  WITH CHECK (edificio_id IN (SELECT fh_edificios_admin()));

DROP POLICY IF EXISTS proveedores_editar ON proveedores;
CREATE POLICY proveedores_editar ON proveedores FOR UPDATE
  USING (fh_es_mi_edificio(edificio_id) OR id = fh_persona_id());

DROP POLICY IF EXISTS proveedores_borrar ON proveedores;
CREATE POLICY proveedores_borrar ON proveedores FOR DELETE
  USING (edificio_id IN (SELECT fh_edificios_admin()));

-- ----------------------------------------------------------------------------
-- PASO 6: el resto de las tablas — todas comparten el mismo patrón:
-- "solo se ve/edita lo que pertenece a MI edificio"
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tablas TEXT[] := ARRAY[
    'avisos','anuncios','reservas','recordatorios','votaciones','votos',
    'encuestas','respuestas_encuesta','emergencias','visitas',
    'reacciones_anuncio','mensajes_privados','votos_tablon','fcm_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_edificio_scope ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_edificio_scope ON %I FOR ALL USING (fh_es_mi_edificio(edificio_id)) WITH CHECK (fh_es_mi_edificio(edificio_id))',
      t, t
    );
  END LOOP;
END $$;

-- mensajes y agenda_proveedor no tienen edificio_id directo — se resuelven
-- vía el aviso/proveedor al que pertenecen
DROP POLICY IF EXISTS mensajes_scope ON mensajes;
CREATE POLICY mensajes_scope ON mensajes FOR ALL
  USING (
    aviso_id IN (SELECT id FROM avisos WHERE fh_es_mi_edificio(edificio_id))
  )
  WITH CHECK (
    aviso_id IN (SELECT id FROM avisos WHERE fh_es_mi_edificio(edificio_id))
  );

DROP POLICY IF EXISTS agenda_proveedor_scope ON agenda_proveedor;
CREATE POLICY agenda_proveedor_scope ON agenda_proveedor FOR ALL
  USING (
    proveedor_id IN (SELECT id FROM proveedores WHERE fh_es_mi_edificio(edificio_id))
  )
  WITH CHECK (
    proveedor_id IN (SELECT id FROM proveedores WHERE fh_es_mi_edificio(edificio_id))
  );

-- mensajes_privados: además de ser del edificio, un vecino solo debe ver
-- SU propia conversación con el admin (no las de otros vecinos)
DROP POLICY IF EXISTS mensajes_privados_edificio_scope ON mensajes_privados;
CREATE POLICY mensajes_privados_propios ON mensajes_privados FOR ALL
  USING (
    fh_es_mi_edificio(edificio_id)
    AND (fh_rol() != 'vecino' OR vecino_id = fh_persona_id())
  )
  WITH CHECK (
    fh_es_mi_edificio(edificio_id)
    AND (fh_rol() != 'vecino' OR vecino_id = fh_persona_id())
  );

-- notificaciones_programadas: son de INFRA, no de un edificio en particular.
-- Bloqueado por completo desde el cliente (RLS sin política = nadie pasa).
-- INFRA las crea con la service_role key desde una Netlify Function.

-- ----------------------------------------------------------------------------
-- PASO 7: funciones RPC seguras para el login — reemplazan las consultas
-- directas que exponían PIN y filas completas.
-- ----------------------------------------------------------------------------

-- Buscar edificio por código de acceso (paso 1 del login). Nunca devuelve
-- pin_admin. Requiere estar autenticado (cuenta real con email/contraseña).
CREATE OR REPLACE FUNCTION fh_buscar_edificio(p_codigo TEXT)
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id, e.nombre, e.direccion FROM edificios e
  WHERE e.codigo_acceso = p_codigo LIMIT 1
$$;
REVOKE ALL ON FUNCTION fh_buscar_edificio(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_buscar_edificio(TEXT) TO authenticated;

-- Verificar PIN de admin: la comparación pasa a hacerse ACÁ, en el servidor.
-- Si el PIN es correcto devuelve todos los edificios con ese PIN; si no,
-- devuelve 0 filas (nunca revela cuál era el PIN correcto).
CREATE OR REPLACE FUNCTION fh_verificar_pin(p_edificio_id UUID, p_pin TEXT)
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_pin_real TEXT;
BEGIN
  SELECT pin_admin INTO v_pin_real FROM edificios WHERE edificios.id = p_edificio_id;
  IF v_pin_real IS NULL OR v_pin_real != p_pin THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT e.id, e.nombre, e.direccion FROM edificios e
    WHERE e.pin_admin = p_pin ORDER BY e.nombre;
END;
$$;
REVOKE ALL ON FUNCTION fh_verificar_pin(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_verificar_pin(UUID, TEXT) TO authenticated;

-- Buscar vecino existente por depto (paso 2 del login, rol vecino)
CREATE OR REPLACE FUNCTION fh_buscar_vecino(p_edificio_id UUID, p_departamento TEXT)
RETURNS TABLE(id UUID, nombre TEXT, departamento TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT v.id, v.nombre, v.departamento FROM vecinos v
  WHERE v.edificio_id = p_edificio_id AND v.departamento = p_departamento LIMIT 1
$$;
REVOKE ALL ON FUNCTION fh_buscar_vecino(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_buscar_vecino(UUID, TEXT) TO authenticated;

-- Buscar proveedor existente por nombre (paso 2 del login, rol proveedor)
CREATE OR REPLACE FUNCTION fh_buscar_proveedor(p_edificio_id UUID, p_nombre TEXT)
RETURNS TABLE(id UUID, nombre TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.id, p.nombre FROM proveedores p
  WHERE p.edificio_id = p_edificio_id AND p.nombre = p_nombre LIMIT 1
$$;
REVOKE ALL ON FUNCTION fh_buscar_proveedor(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_buscar_proveedor(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- PASO 8: comprobar si la cuenta logueada es INFRA (reemplaza la palabra
-- mágica "INFRA" sin ninguna verificación)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fh_es_infra()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM perfiles WHERE auth_user_id = auth.uid() AND rol = 'infra')
$$;
REVOKE ALL ON FUNCTION fh_es_infra() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_es_infra() TO authenticated;

-- ----------------------------------------------------------------------------
-- PASO 9: bypass para INFRA — el panel maestro necesita ver y administrar
-- TODOS los edificios (no solo "el mío"), y notificaciones_programadas no
-- tiene ninguna política todavía (nadie podía tocarla desde el cliente).
-- Sin este paso, el panel INFRA se queda sin datos después de activar RLS.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS edificios_infra ON edificios;
CREATE POLICY edificios_infra ON edificios FOR ALL
  USING (fh_es_infra()) WITH CHECK (fh_es_infra());

DROP POLICY IF EXISTS vecinos_infra ON vecinos;
CREATE POLICY vecinos_infra ON vecinos FOR ALL
  USING (fh_es_infra()) WITH CHECK (fh_es_infra());

DROP POLICY IF EXISTS proveedores_infra ON proveedores;
CREATE POLICY proveedores_infra ON proveedores FOR ALL
  USING (fh_es_infra()) WITH CHECK (fh_es_infra());

DROP POLICY IF EXISTS avisos_infra ON avisos;
CREATE POLICY avisos_infra ON avisos FOR ALL
  USING (fh_es_infra()) WITH CHECK (fh_es_infra());

DROP POLICY IF EXISTS notificaciones_programadas_infra ON notificaciones_programadas;
CREATE POLICY notificaciones_programadas_infra ON notificaciones_programadas FOR ALL
  USING (fh_es_infra()) WITH CHECK (fh_es_infra());

-- ============================================================================
-- FIN. Después de correr esto, pasame tu email de cuenta real (Mirko) y te
-- doy el UPDATE exacto para marcar tu perfil como rol='infra'.
-- ============================================================================
