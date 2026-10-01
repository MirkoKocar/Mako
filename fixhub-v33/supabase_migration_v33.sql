-- ============================================================================
-- FixHub v33 — Flujo de autorización del admin + seguridad completa
-- ============================================================================
-- QUÉ HACE ESTE ARCHIVO
--  1. Flujo nuevo de reportes: vecino reporta -> el admin autoriza/rechaza/
--     pide info -> el proveedor acepta por link -> finaliza con remito/foto ->
--     vecino y admin confirman. Todo con estados ("fase") controlados por el
--     servidor: el navegador ya NO puede saltarse pasos.
--  2. Reglas automáticas opcionales por edificio (monto, horario, urgencia).
--  3. Reescribe TODAS las políticas de seguridad (RLS). Corrige agujeros de
--     la v31 (ver el listado al final del archivo SETUP_v33.md).
--  4. Storage privado para fotos/videos/remitos.
--  5. Eliminación de cuenta y aceptación de términos.
--
-- CÓMO APLICAR: Supabase -> SQL Editor -> New query -> pegar TODO -> Run.
-- Es idempotente (se puede correr más de una vez). Corre todo o nada: si da
-- error, no queda a medias — mandame el mensaje exacto.
-- No hace falta que la v31 haya corrido bien: este archivo rehace lo que
-- necesita (incluye las funciones y políticas de la v31).
-- ============================================================================


-- ============================================================================
-- SECCIÓN 0 — Columnas de versiones anteriores (por si alguna migración vieja
-- no se había corrido: así este archivo funciona igual)
-- ============================================================================
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS pendiente_aprobacion BOOLEAN DEFAULT FALSE;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS resuelto_vecino BOOLEAN DEFAULT false;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS resuelto_admin BOOLEAN DEFAULT false;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS presupuesto NUMERIC;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS publicado_tablon BOOLEAN DEFAULT false;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS es_nota_interna BOOLEAN DEFAULT FALSE;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS editado BOOLEAN DEFAULT FALSE;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS leido BOOLEAN DEFAULT FALSE;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS imagen_url TEXT;
ALTER TABLE edificios ADD COLUMN IF NOT EXISTS pin_admin VARCHAR(6);
ALTER TABLE edificios ADD COLUMN IF NOT EXISTS estado_pago TEXT DEFAULT 'activo';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ranking INTEGER DEFAULT 50;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT TRUE;


-- ============================================================================
-- SECCIÓN 1 — Funciones auxiliares (leen el perfil de quien está logueado)
-- ============================================================================
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

CREATE OR REPLACE FUNCTION fh_edificios_admin() RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id FROM edificios e
  JOIN perfiles p ON p.pin = e.pin_admin
  WHERE p.auth_user_id = auth.uid() AND p.rol = 'admin' AND p.pin IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION fh_es_mi_edificio(p_edificio_id UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_edificio_id IS NOT NULL AND (
    p_edificio_id = fh_edificio_id()
    OR p_edificio_id IN (SELECT fh_edificios_admin())
  )
$$;

CREATE OR REPLACE FUNCTION fh_es_infra() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM perfiles WHERE auth_user_id = auth.uid() AND rol = 'infra')
$$;

-- ¿Este edificio lo administro yo?
CREATE OR REPLACE FUNCTION fh_es_admin_de(p_edificio_id UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_edificio_id IS NOT NULL AND p_edificio_id IN (SELECT fh_edificios_admin())
$$;

-- UUID seguro: devuelve NULL si el texto no es un UUID válido
CREATE OR REPLACE FUNCTION fh_uuid_safe(p_txt TEXT) RETURNS UUID
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p_txt::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;


-- ============================================================================
-- SECCIÓN 2 — Columnas y tablas nuevas
-- ============================================================================
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS fase TEXT NOT NULL DEFAULT 'pendiente_admin';
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS adjuntos JSONB NOT NULL DEFAULT '[]';
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS contacto_telefono TEXT;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS proveedor_nombre TEXT;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS costo_estimado NUMERIC;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS autorizado_por TEXT;          -- 'admin' | 'auto'
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS autorizado_at TIMESTAMPTZ;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS motivo_info TEXT;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS derivado_at TIMESTAMPTZ;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS aceptado_at TIMESTAMPTZ;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS finalizado_at TIMESTAMPTZ;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMPTZ;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS motivo_no_puede TEXT;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS proveedores_descartados UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS nota_cierre TEXT;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS cierre_adjuntos JSONB NOT NULL DEFAULT '[]';
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS enlace_enviado_at TIMESTAMPTZ;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS enviado_at TIMESTAMPTZ;   -- cuando el vecino terminó de cargar fotos y mandó el reporte
UPDATE avisos SET enviado_at = created_at WHERE enviado_at IS NULL;
-- (ya existían: presupuesto = monto final del trabajo, motivo_rechazo,
--  pendiente_aprobacion, resuelto_vecino, resuelto_admin, publicado_tablon)

-- Pasar los avisos que ya existen a la fase que les corresponde
UPDATE avisos SET fase = CASE
    WHEN estado = 'resuelto'                                   THEN 'cerrado'
    WHEN estado = 'en_curso' AND presupuesto IS NOT NULL       THEN 'finalizado_proveedor'
    WHEN estado = 'en_curso'                                   THEN 'en_camino'
    WHEN estado = 'nuevo' AND motivo_rechazo IS NOT NULL       THEN 'rechazado'
    WHEN proveedor_id IS NOT NULL                              THEN 'derivado'
    ELSE 'pendiente_admin' END
WHERE fase = 'pendiente_admin' AND (estado <> 'nuevo' OR proveedor_id IS NOT NULL OR motivo_rechazo IS NOT NULL);

UPDATE avisos a SET proveedor_nombre = p.nombre
FROM proveedores p WHERE a.proveedor_id = p.id AND a.proveedor_nombre IS NULL;

ALTER TABLE vecinos     ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMPTZ;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMPTZ;
ALTER TABLE perfiles    ADD COLUMN IF NOT EXISTS terminos_version TEXT;
ALTER TABLE perfiles    ADD COLUMN IF NOT EXISTS terminos_aceptados_at TIMESTAMPTZ;
ALTER TABLE fcm_tokens  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

-- Para que INFRA vea si un edificio tiene PIN sin poder leer el PIN
ALTER TABLE edificios ADD COLUMN IF NOT EXISTS tiene_pin BOOLEAN GENERATED ALWAYS AS (pin_admin IS NOT NULL) STORED;

-- Reglas automáticas por edificio (el "opcional pro")
CREATE TABLE IF NOT EXISTS reglas_autorizacion (
  edificio_id UUID PRIMARY KEY REFERENCES edificios(id) ON DELETE CASCADE,
  auto_activo BOOLEAN NOT NULL DEFAULT false,
  monto_maximo NUMERIC CHECK (monto_maximo IS NULL OR monto_maximo >= 0),
  hora_desde TIME NOT NULL DEFAULT '08:00',
  hora_hasta TIME NOT NULL DEFAULT '18:00',
  solo_dias_habiles BOOLEAN NOT NULL DEFAULT true,
  costos_estimados JSONB NOT NULL DEFAULT '{}',
  urgencia_alta_deriva_directo BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Links de acceso para proveedores (solo se guarda el HASH, nunca el link)
CREATE TABLE IF NOT EXISTS enlaces_proveedor (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aviso_id UUID NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revocado BOOLEAN NOT NULL DEFAULT false,
  usos INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enlaces_aviso ON enlaces_proveedor(aviso_id);

-- Freno a la fuerza bruta del PIN del admin
CREATE TABLE IF NOT EXISTS intentos_pin (
  auth_user_id UUID NOT NULL,
  edificio_id UUID NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, edificio_id)
);

ALTER TABLE reglas_autorizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE enlaces_proveedor   ENABLE ROW LEVEL SECURITY;
ALTER TABLE intentos_pin        ENABLE ROW LEVEL SECURITY;
-- enlaces_proveedor e intentos_pin: sin políticas = nadie del navegador las toca
-- (solo el servidor con service_role y las funciones internas)

-- Si borrás un proveedor, los reclamos viejos se conservan (con el nombre
-- guardado en proveedor_nombre) en vez de bloquear el borrado.
ALTER TABLE avisos   DROP CONSTRAINT IF EXISTS avisos_proveedor_id_fkey;
ALTER TABLE avisos   ADD  CONSTRAINT avisos_proveedor_id_fkey   FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_proveedor_id_fkey;
ALTER TABLE mensajes ADD  CONSTRAINT mensajes_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;


-- ============================================================================
-- SECCIÓN 3 — Validaciones a nivel base de datos (NOT VALID = no molesta a
-- los datos viejos, pero se exige en todo lo nuevo)
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE avisos ADD CONSTRAINT avisos_fase_chk CHECK (fase IN
    ('pendiente_admin','info_solicitada','rechazado','derivado','en_camino','finalizado_proveedor','cerrado')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE avisos ADD CONSTRAINT avisos_urgencia_chk CHECK (urgencia IN ('baja','media','alta')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE avisos ADD CONSTRAINT avisos_largos_chk CHECK (
    char_length(coalesce(titulo,'')) <= 200 AND char_length(coalesce(descripcion,'')) <= 1000
    AND char_length(coalesce(contacto_telefono,'')) <= 20) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE avisos ADD CONSTRAINT avisos_monto_chk CHECK (presupuesto IS NULL OR (presupuesto >= 0 AND presupuesto < 1000000000)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE mensajes ADD CONSTRAINT mensajes_largo_chk CHECK (char_length(contenido) <= 2000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE mensajes_privados ADD CONSTRAINT mensajes_privados_largo_chk CHECK (char_length(contenido) <= 2000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECCIÓN 4 — Regla automática al crear un reporte (corre en el servidor,
-- no se puede saltear desde el navegador)
-- ============================================================================
CREATE OR REPLACE FUNCTION fh_avisos_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r reglas_autorizacion%ROWTYPE;
  v_costo NUMERIC;
BEGIN
  -- El estado inicial lo decide el servidor, nunca el cliente
  NEW.fase := 'pendiente_admin';
  NEW.estado := 'nuevo';
  NEW.proveedor_id := NULL;
  NEW.proveedor_nombre := NULL;
  NEW.autorizado_por := NULL;
  NEW.autorizado_at := NULL;
  NEW.derivado_at := NULL;
  NEW.aceptado_at := NULL;
  NEW.finalizado_at := NULL;
  NEW.cerrado_at := NULL;
  NEW.enlace_enviado_at := NULL;
  NEW.enviado_at := NULL;
  NEW.resuelto_vecino := false;
  NEW.resuelto_admin := false;
  NEW.presupuesto := NULL;
  NEW.motivo_rechazo := NULL;
  NEW.motivo_info := NULL;
  NEW.motivo_no_puede := NULL;
  NEW.nota_cierre := NULL;
  NEW.cierre_adjuntos := '[]';
  NEW.proveedores_descartados := '{}';
  NEW.pendiente_aprobacion := true;
  NEW.updated_at := now();
  IF NEW.urgencia IS NULL THEN NEW.urgencia := 'media'; END IF;

  -- Costo estimado de la categoría (se muestra en la tarjeta del admin)
  SELECT * INTO r FROM reglas_autorizacion WHERE edificio_id = NEW.edificio_id;
  IF FOUND THEN
    BEGIN
      v_costo := NULLIF(r.costos_estimados ->> NEW.categoria, '')::numeric;
    EXCEPTION WHEN others THEN v_costo := NULL;
    END;
  END IF;
  NEW.costo_estimado := v_costo;
  RETURN NEW;
END;
$$;

-- El vecino "manda" el reporte cuando terminó de subir las fotos. Recién ahí
-- el admin lo ve y se aplican las reglas automáticas (si las hay).
CREATE OR REPLACE FUNCTION fh_enviar_reporte(p_aviso UUID)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a avisos; res avisos; r reglas_autorizacion%ROWTYPE;
  v_ahora TIMESTAMP; v_habil BOOLEAN; v_prov_id UUID; v_prov_nombre TEXT;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR fh_rol() IS DISTINCT FROM 'vecino' OR a.vecino_id IS DISTINCT FROM fh_persona_id() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF a.enviado_at IS NOT NULL THEN RETURN a; END IF;   -- ya enviado: no se aplica dos veces
  IF a.fase <> 'pendiente_admin' THEN RAISE EXCEPTION 'Reporte inválido'; END IF;

  UPDATE avisos SET enviado_at = now(), updated_at = now() WHERE id = p_aviso RETURNING * INTO res;

  SELECT * INTO r FROM reglas_autorizacion WHERE edificio_id = a.edificio_id;
  IF NOT FOUND OR NOT r.auto_activo OR a.categoria = 'Otro' THEN RETURN res; END IF;

  v_ahora := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_habil := (NOT r.solo_dias_habiles OR EXTRACT(ISODOW FROM v_ahora) <= 5)
             AND v_ahora::time >= r.hora_desde AND v_ahora::time < r.hora_hasta;

  IF (v_habil AND a.costo_estimado IS NOT NULL AND r.monto_maximo IS NOT NULL AND a.costo_estimado < r.monto_maximo)
     OR (a.urgencia = 'alta' AND r.urgencia_alta_deriva_directo) THEN
    SELECT id, nombre INTO v_prov_id, v_prov_nombre FROM proveedores
      WHERE edificio_id = a.edificio_id AND especialidad = a.categoria
        AND disponible IS TRUE AND eliminado_at IS NULL
      ORDER BY ranking DESC NULLS LAST, created_at ASC LIMIT 1;
    IF v_prov_id IS NOT NULL THEN
      UPDATE avisos SET fase = 'derivado', estado = 'en_curso', proveedor_id = v_prov_id, proveedor_nombre = v_prov_nombre,
        autorizado_por = 'auto', autorizado_at = now(), derivado_at = now(), pendiente_aprobacion = false, updated_at = now()
      WHERE id = p_aviso RETURNING * INTO res;
    END IF;
  END IF;
  RETURN res;
END;
$$;

-- El vecino responde a un "pedir más info" (vuelve a la bandeja del admin)
CREATE OR REPLACE FUNCTION fh_vecino_responder_info(p_aviso UUID, p_texto TEXT)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; v_txt TEXT := btrim(coalesce(p_texto,''));
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR fh_rol() IS DISTINCT FROM 'vecino' OR a.vecino_id IS DISTINCT FROM fh_persona_id() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF a.fase <> 'info_solicitada' THEN RAISE EXCEPTION 'El administrador no pidió más información'; END IF;
  IF char_length(v_txt) < 2 OR char_length(v_txt) > 1000 THEN RAISE EXCEPTION 'Escribí tu respuesta'; END IF;
  INSERT INTO mensajes_privados (edificio_id, vecino_id, aviso_id, autor, contenido, leido)
  VALUES (a.edificio_id, a.vecino_id, a.id, 'vecino', 'Respuesta sobre "' || left(a.titulo, 80) || '": ' || v_txt, false);
  UPDATE avisos SET fase = 'pendiente_admin', updated_at = now() WHERE id = p_aviso RETURNING * INTO res;
  RETURN res;
END;
$$;

DROP TRIGGER IF EXISTS trg_avisos_before_insert ON avisos;
CREATE TRIGGER trg_avisos_before_insert BEFORE INSERT ON avisos
  FOR EACH ROW EXECUTE FUNCTION fh_avisos_before_insert();

-- Un mensaje solo lo puede editar quien lo escribió
CREATE OR REPLACE FUNCTION fh_mensajes_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.contenido IS DISTINCT FROM OLD.contenido THEN
    IF OLD.remitente_rol IS DISTINCT FROM fh_rol() THEN
      RAISE EXCEPTION 'Solo podés editar tus propios mensajes';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mensajes_guard ON mensajes;
CREATE TRIGGER trg_mensajes_guard BEFORE UPDATE ON mensajes
  FOR EACH ROW EXECUTE FUNCTION fh_mensajes_guard();

-- Un proveedor solo puede tocar su "disponible" (no su ranking, especialidad, etc.)
CREATE OR REPLACE FUNCTION fh_proveedores_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('fh.bypass', true) = 'on' THEN RETURN NEW; END IF;
  IF fh_es_infra() OR fh_es_admin_de(OLD.edificio_id) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - 'disponible') IS DISTINCT FROM (to_jsonb(OLD) - 'disponible') THEN
    RAISE EXCEPTION 'Solo podés cambiar tu disponibilidad';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proveedores_guard ON proveedores;
CREATE TRIGGER trg_proveedores_guard BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION fh_proveedores_guard();


-- ============================================================================
-- SECCIÓN 5 — Funciones (RPC) del flujo. Cada una valida QUIÉN la llama y en
-- QUÉ fase está el reclamo. Son la única forma de cambiar la fase.
-- ============================================================================

-- Admin: Autorizar y derivar a un proveedor
CREATE OR REPLACE FUNCTION fh_admin_autorizar(p_aviso UUID, p_proveedor UUID)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; p proveedores; res avisos;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR NOT fh_es_admin_de(a.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('pendiente_admin','info_solicitada') THEN RAISE EXCEPTION 'Este reclamo ya no está pendiente de autorización'; END IF;
  SELECT * INTO p FROM proveedores WHERE id = p_proveedor AND edificio_id = a.edificio_id AND eliminado_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor inválido para este edificio'; END IF;
  UPDATE avisos SET fase = 'derivado', estado = 'en_curso', proveedor_id = p.id, proveedor_nombre = p.nombre,
    autorizado_por = 'admin', autorizado_at = now(), derivado_at = now(), pendiente_aprobacion = false,
    motivo_info = NULL, motivo_no_puede = NULL, enlace_enviado_at = NULL, updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  RETURN res;
END;
$$;

-- Admin: Rechazar (con motivo)
CREATE OR REPLACE FUNCTION fh_admin_rechazar(p_aviso UUID, p_motivo TEXT)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; v_motivo TEXT := btrim(coalesce(p_motivo,''));
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR NOT fh_es_admin_de(a.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('pendiente_admin','info_solicitada') THEN RAISE EXCEPTION 'Este reclamo ya no está pendiente de autorización'; END IF;
  IF char_length(v_motivo) < 5 OR char_length(v_motivo) > 500 THEN RAISE EXCEPTION 'Escribí un motivo (entre 5 y 500 caracteres)'; END IF;
  UPDATE avisos SET fase = 'rechazado', estado = 'resuelto', motivo_rechazo = v_motivo, pendiente_aprobacion = false,
    cerrado_at = now(), updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  RETURN res;
END;
$$;

-- Admin: Pedir más información al vecino (queda también en el chat privado)
CREATE OR REPLACE FUNCTION fh_admin_pedir_info(p_aviso UUID, p_mensaje TEXT)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; v_msg TEXT := btrim(coalesce(p_mensaje,''));
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR NOT fh_es_admin_de(a.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('pendiente_admin','info_solicitada') THEN RAISE EXCEPTION 'Este reclamo ya no está pendiente de autorización'; END IF;
  IF char_length(v_msg) < 5 OR char_length(v_msg) > 500 THEN RAISE EXCEPTION 'Escribí qué necesitás saber (entre 5 y 500 caracteres)'; END IF;
  UPDATE avisos SET fase = 'info_solicitada', motivo_info = v_msg, updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  INSERT INTO mensajes_privados (edificio_id, vecino_id, aviso_id, autor, contenido, leido)
  VALUES (a.edificio_id, a.vecino_id, a.id, 'admin', 'Sobre tu reporte "' || left(a.titulo, 80) || '": ' || v_msg, false);
  RETURN res;
END;
$$;

-- Proveedor: "Aceptar trabajo / Voy en camino"
CREATE OR REPLACE FUNCTION fh_proveedor_aceptar(p_aviso UUID)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR fh_rol() IS DISTINCT FROM 'proveedor' OR a.proveedor_id IS DISTINCT FROM fh_persona_id() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF a.fase <> 'derivado' THEN RAISE EXCEPTION 'Este trabajo ya no está esperando tu respuesta'; END IF;
  UPDATE avisos SET fase = 'en_camino', aceptado_at = now(), updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  RETURN res;
END;
$$;

-- Proveedor: "No puedo ir" -> pasa al siguiente proveedor (si el reclamo se
-- autorizó automáticamente y hay otro disponible) o vuelve al admin
CREATE OR REPLACE FUNCTION fh_proveedor_no_puede(p_aviso UUID, p_motivo TEXT)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; v_sig_id UUID; v_sig_nombre TEXT; v_desc UUID[]; v_motivo TEXT := left(btrim(coalesce(p_motivo,'')), 300);
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR fh_rol() IS DISTINCT FROM 'proveedor' OR a.proveedor_id IS DISTINCT FROM fh_persona_id() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF a.fase NOT IN ('derivado','en_camino') THEN RAISE EXCEPTION 'Este trabajo ya no se puede rechazar'; END IF;
  v_desc := array_append(a.proveedores_descartados, a.proveedor_id);

  IF a.autorizado_por = 'auto' THEN
    SELECT id, nombre INTO v_sig_id, v_sig_nombre FROM proveedores
      WHERE edificio_id = a.edificio_id AND especialidad = a.categoria AND disponible IS TRUE
        AND eliminado_at IS NULL AND NOT (id = ANY (v_desc))
      ORDER BY ranking DESC NULLS LAST, created_at ASC LIMIT 1;
  END IF;

  IF v_sig_id IS NOT NULL THEN
    UPDATE avisos SET proveedor_id = v_sig_id, proveedor_nombre = v_sig_nombre, proveedores_descartados = v_desc,
      fase = 'derivado', estado = 'en_curso', derivado_at = now(), aceptado_at = NULL, enlace_enviado_at = NULL,
      motivo_no_puede = v_motivo, updated_at = now()
    WHERE id = p_aviso RETURNING * INTO res;
  ELSE
    UPDATE avisos SET proveedor_id = NULL, proveedor_nombre = NULL, proveedores_descartados = v_desc,
      fase = 'pendiente_admin', estado = 'nuevo', pendiente_aprobacion = true, aceptado_at = NULL,
      derivado_at = NULL, enlace_enviado_at = NULL, motivo_no_puede = v_motivo, updated_at = now()
    WHERE id = p_aviso RETURNING * INTO res;
  END IF;
  RETURN res;
END;
$$;

-- Proveedor: Finalizar (monto + remito firmado o foto del resultado)
CREATE OR REPLACE FUNCTION fh_proveedor_finalizar(p_aviso UUID, p_monto NUMERIC, p_nota TEXT, p_adjuntos JSONB)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; it JSONB; v_prefijo TEXT;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR fh_rol() IS DISTINCT FROM 'proveedor' OR a.proveedor_id IS DISTINCT FROM fh_persona_id() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF a.fase NOT IN ('derivado','en_camino') THEN RAISE EXCEPTION 'Este trabajo no se puede finalizar en este momento'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 OR p_monto >= 1000000000 THEN RAISE EXCEPTION 'Ingresá un monto válido'; END IF;
  IF p_adjuntos IS NULL OR jsonb_typeof(p_adjuntos) <> 'array' OR jsonb_array_length(p_adjuntos) < 1 OR jsonb_array_length(p_adjuntos) > 10 THEN
    RAISE EXCEPTION 'Subí al menos un remito firmado o una foto de cómo quedó';
  END IF;
  v_prefijo := a.edificio_id::text || '/' || a.id::text || '/';
  FOR it IN SELECT * FROM jsonb_array_elements(p_adjuntos) LOOP
    IF coalesce(it->>'path','') NOT LIKE (v_prefijo || '%') THEN RAISE EXCEPTION 'Adjunto inválido'; END IF;
  END LOOP;
  UPDATE avisos SET fase = 'finalizado_proveedor', estado = 'en_curso', presupuesto = p_monto,
    nota_cierre = left(btrim(coalesce(p_nota,'')), 500), cierre_adjuntos = p_adjuntos,
    aceptado_at = coalesce(aceptado_at, now()), finalizado_at = now(),
    resuelto_vecino = false, resuelto_admin = false, updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  RETURN res;
END;
$$;

-- Vecino y admin confirman que quedó resuelto (doble confirmación)
CREATE OR REPLACE FUNCTION fh_confirmar_resuelto(p_aviso UUID)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; v_rol TEXT := fh_rol(); rv BOOLEAN; ra BOOLEAN;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase <> 'finalizado_proveedor' THEN RAISE EXCEPTION 'El proveedor todavía no finalizó el trabajo'; END IF;
  rv := a.resuelto_vecino; ra := a.resuelto_admin;
  IF v_rol = 'vecino' AND a.vecino_id = fh_persona_id() THEN rv := true;
  ELSIF v_rol = 'admin' AND fh_es_admin_de(a.edificio_id) THEN ra := true;
  ELSE RAISE EXCEPTION 'No autorizado';
  END IF;
  IF rv AND ra THEN
    UPDATE avisos SET resuelto_vecino = rv, resuelto_admin = ra, fase = 'cerrado', estado = 'resuelto',
      cerrado_at = now(), updated_at = now() WHERE id = p_aviso RETURNING * INTO res;
  ELSE
    UPDATE avisos SET resuelto_vecino = rv, resuelto_admin = ra, updated_at = now()
      WHERE id = p_aviso RETURNING * INTO res;
  END IF;
  RETURN res;
END;
$$;

-- Admin: sacar al proveedor (no responde / no puede) y volver a elegir otro
CREATE OR REPLACE FUNCTION fh_admin_reasignar(p_aviso UUID)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR NOT fh_es_admin_de(a.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('derivado','en_camino') THEN RAISE EXCEPTION 'Este reclamo no tiene un proveedor para cambiar'; END IF;
  UPDATE enlaces_proveedor SET revocado = true WHERE aviso_id = p_aviso;
  UPDATE avisos SET proveedores_descartados = array_append(proveedores_descartados, proveedor_id),
    proveedor_id = NULL, proveedor_nombre = NULL, fase = 'pendiente_admin', estado = 'nuevo', pendiente_aprobacion = true,
    autorizado_por = NULL, derivado_at = NULL, aceptado_at = NULL, enlace_enviado_at = NULL,
    motivo_no_puede = 'El administrador cambió de proveedor', updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  RETURN res;
END;
$$;

-- Admin: cambiar el "Aviso ya enviado al proveedor" (para reenviar el link)
CREATE OR REPLACE FUNCTION fh_admin_desvincular_proveedor(p_proveedor UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p proveedores;
BEGIN
  SELECT * INTO p FROM proveedores WHERE id = p_proveedor;
  IF NOT FOUND OR NOT fh_es_admin_de(p.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM set_config('fh.bypass', 'on', true);
  DELETE FROM perfiles WHERE rol = 'proveedor' AND persona_id = p.id;
  UPDATE proveedores SET auth_user_id = NULL WHERE id = p.id;
  UPDATE enlaces_proveedor SET revocado = true WHERE proveedor_id = p.id;
END;
$$;


-- ============================================================================
-- SECCIÓN 6 — Login / vinculación de cuenta (reemplaza los upsert directos a
-- "perfiles", que permitían a cualquiera hacerse INFRA o admin)
-- ============================================================================

-- Términos y condiciones: versión aceptada al crear la cuenta (queda en la
-- metadata del usuario) o desde la pantalla de aceptación.
CREATE OR REPLACE FUNCTION fh_aceptar_terminos(p_version TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE perfiles SET terminos_version = left(p_version, 20), terminos_aceptados_at = now()
  WHERE auth_user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION fh_upsert_perfil(p_rol TEXT, p_edificio UUID, p_persona UUID, p_pin TEXT, p_nombre TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ver TEXT; v_when TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF fh_es_infra() THEN RAISE EXCEPTION 'Las cuentas INFRA no se pueden vincular a un edificio'; END IF;
  SELECT raw_user_meta_data->>'terminos_version', raw_user_meta_data->>'terminos_aceptados_at'
    INTO v_ver, v_when FROM auth.users WHERE id = auth.uid();
  INSERT INTO perfiles (auth_user_id, rol, edificio_id, persona_id, pin, nombre, terminos_version, terminos_aceptados_at)
  VALUES (auth.uid(), p_rol, p_edificio, p_persona, p_pin, p_nombre, v_ver, NULLIF(v_when,'')::timestamptz)
  ON CONFLICT (auth_user_id) DO UPDATE SET
    rol = EXCLUDED.rol, edificio_id = EXCLUDED.edificio_id, persona_id = EXCLUDED.persona_id,
    pin = EXCLUDED.pin, nombre = EXCLUDED.nombre,
    terminos_version = coalesce(perfiles.terminos_version, EXCLUDED.terminos_version),
    terminos_aceptados_at = coalesce(perfiles.terminos_aceptados_at, EXCLUDED.terminos_aceptados_at);
END;
$$;

-- Edificios que administro (para reconstruir la sesión sin exponer el PIN)
CREATE OR REPLACE FUNCTION fh_mis_edificios()
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT, codigo_acceso TEXT, estado_pago TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id, e.nombre, e.direccion, e.codigo_acceso, e.estado_pago FROM edificios e
  WHERE e.id IN (SELECT fh_edificios_admin()) ORDER BY e.nombre
$$;

DROP FUNCTION IF EXISTS fh_buscar_edificio(TEXT);
CREATE OR REPLACE FUNCTION fh_buscar_edificio(p_codigo TEXT)
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT, estado_pago TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id, e.nombre, e.direccion, e.estado_pago FROM edificios e
  WHERE e.codigo_acceso = p_codigo LIMIT 1
$$;
REVOKE ALL ON FUNCTION fh_buscar_edificio(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_buscar_edificio(TEXT) TO authenticated;

-- Admin: verifica el PIN (con freno de 5 intentos cada 15 minutos) y vincula
CREATE OR REPLACE FUNCTION fh_vincular_admin(p_edificio UUID, p_pin TEXT)
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT, codigo_acceso TEXT, estado_pago TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_real TEXT; v_int intentos_pin%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'El PIN debe tener 6 dígitos'; END IF;
  SELECT * INTO v_int FROM intentos_pin WHERE auth_user_id = auth.uid() AND edificio_id = p_edificio;
  IF FOUND AND v_int.intentos >= 5 AND v_int.ultimo > now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.';
  END IF;
  SELECT pin_admin INTO v_real FROM edificios WHERE edificios.id = p_edificio;
  IF v_real IS NULL OR v_real <> p_pin THEN
    INSERT INTO intentos_pin (auth_user_id, edificio_id, intentos, ultimo) VALUES (auth.uid(), p_edificio, 1, now())
    ON CONFLICT (auth_user_id, edificio_id) DO UPDATE SET
      intentos = CASE WHEN intentos_pin.ultimo > now() - interval '15 minutes' THEN intentos_pin.intentos + 1 ELSE 1 END,
      ultimo = now();
    RETURN;
  END IF;
  DELETE FROM intentos_pin WHERE auth_user_id = auth.uid() AND edificio_id = p_edificio;
  PERFORM fh_upsert_perfil('admin', p_edificio, NULL, p_pin, 'Administrador');
  RETURN QUERY SELECT e.id, e.nombre, e.direccion, e.codigo_acceso, e.estado_pago FROM edificios e
    WHERE e.pin_admin = p_pin ORDER BY e.nombre;
END;
$$;
REVOKE ALL ON FUNCTION fh_vincular_admin(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_vincular_admin(UUID, TEXT) TO authenticated;

-- Admin: agregar otro edificio (mismo PIN) desde "Mis edificios"
CREATE OR REPLACE FUNCTION fh_agregar_edificio_admin(p_codigo TEXT)
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT, codigo_acceso TEXT, estado_pago TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id, e.nombre, e.direccion, e.codigo_acceso, e.estado_pago FROM edificios e
  WHERE e.codigo_acceso = upper(btrim(p_codigo)) AND e.id IN (SELECT fh_edificios_admin()) LIMIT 1
$$;

-- Vecino: alta o vinculación por unidad
CREATE OR REPLACE FUNCTION fh_vincular_vecino(p_edificio UUID, p_departamento TEXT, p_nombre TEXT)
RETURNS TABLE(id UUID, nombre TEXT, departamento TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v vecinos; v_nombre TEXT := btrim(coalesce(p_nombre,'')); v_dep TEXT := btrim(coalesce(p_departamento,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM edificios WHERE edificios.id = p_edificio) THEN RAISE EXCEPTION 'Edificio inexistente'; END IF;
  IF char_length(v_nombre) < 2 OR char_length(v_nombre) > 60 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;
  IF char_length(v_dep) < 1 OR char_length(v_dep) > 40 THEN RAISE EXCEPTION 'Unidad inválida'; END IF;
  SELECT * INTO v FROM vecinos WHERE vecinos.edificio_id = p_edificio AND vecinos.departamento = v_dep AND vecinos.eliminado_at IS NULL LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO vecinos (edificio_id, departamento, nombre) VALUES (p_edificio, v_dep, v_nombre) RETURNING * INTO v;
  END IF;
  PERFORM fh_upsert_perfil('vecino', p_edificio, v.id, NULL, v.nombre);
  RETURN QUERY SELECT v.id, v.nombre, v.departamento;
END;
$$;
REVOKE ALL ON FUNCTION fh_vincular_vecino(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_vincular_vecino(UUID, TEXT, TEXT) TO authenticated;

-- Proveedor: vincular por nombre (solo si ese proveedor todavía no tiene cuenta)
CREATE OR REPLACE FUNCTION fh_vincular_proveedor(p_edificio UUID, p_nombre TEXT)
RETURNS TABLE(id UUID, nombre TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p proveedores;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO p FROM proveedores WHERE edificio_id = p_edificio AND proveedores.nombre = btrim(p_nombre) AND eliminado_at IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  IF p.auth_user_id IS NOT NULL AND p.auth_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Este proveedor ya tiene una cuenta vinculada. Pedile al administrador que la desvincule.';
  END IF;
  PERFORM set_config('fh.bypass', 'on', true);
  UPDATE proveedores SET auth_user_id = auth.uid() WHERE proveedores.id = p.id;
  PERFORM fh_upsert_perfil('proveedor', p_edificio, p.id, NULL, p.nombre);
  RETURN QUERY SELECT p.id, p.nombre;
END;
$$;
REVOKE ALL ON FUNCTION fh_vincular_proveedor(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_vincular_proveedor(UUID, TEXT) TO authenticated;

-- El buscador viejo de vecino/proveedor y el verificador de PIN sin freno se cierran
DO $$ BEGIN
  BEGIN REVOKE EXECUTE ON FUNCTION fh_verificar_pin(UUID, TEXT)    FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION fh_buscar_vecino(UUID, TEXT)    FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION fh_buscar_proveedor(UUID, TEXT) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

-- Token de notificaciones push (solo para tu propio usuario y tu propio edificio)
CREATE OR REPLACE FUNCTION fh_registrar_token(p_token TEXT, p_rol TEXT, p_edificio UUID, p_user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_rol IS DISTINCT FROM fh_rol() OR NOT fh_es_mi_edificio(p_edificio) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_rol IN ('vecino','proveedor') AND p_user IS DISTINCT FROM fh_persona_id() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  INSERT INTO fcm_tokens (user_id, rol, edificio_id, token, auth_user_id, updated_at)
  VALUES (p_user, p_rol, p_edificio, p_token, auth.uid(), now())
  ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, rol = EXCLUDED.rol,
    edificio_id = EXCLUDED.edificio_id, auth_user_id = auth.uid(), updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION fh_registrar_token(TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_registrar_token(TEXT, TEXT, UUID, UUID) TO authenticated;


-- ============================================================================
-- SECCIÓN 7 — Eliminar cuenta (Ley 25.326 / requisito de Google Play y App Store)
-- Borra los datos personales y conserva lo mínimo necesario para la contabilidad
-- del consorcio, anonimizado. La cuenta de acceso la borra después el servidor.
-- ============================================================================
CREATE OR REPLACE FUNCTION fh_eliminar_mis_datos() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pf perfiles; v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO pf FROM perfiles WHERE auth_user_id = v_uid;
  IF pf.rol = 'infra' THEN RAISE EXCEPTION 'Las cuentas INFRA no se eliminan desde la app'; END IF;
  PERFORM set_config('fh.bypass', 'on', true);

  DELETE FROM fcm_tokens WHERE auth_user_id = v_uid;

  IF pf.rol = 'vecino' AND pf.persona_id IS NOT NULL THEN
    DELETE FROM mensajes_privados   WHERE vecino_id = pf.persona_id;
    DELETE FROM votos_tablon        WHERE vecino_id = pf.persona_id;
    DELETE FROM reacciones_anuncio  WHERE vecino_id = pf.persona_id;
    DELETE FROM respuestas_encuesta WHERE vecino_id = pf.persona_id;
    DELETE FROM votos               WHERE vecino_id = pf.persona_id;
    DELETE FROM reservas            WHERE vecino_id = pf.persona_id;
    DELETE FROM visitas             WHERE vecino_id = pf.persona_id;
    DELETE FROM fcm_tokens          WHERE user_id = pf.persona_id;
    -- Los reclamos quedan (el consorcio los necesita para sus gastos) pero sin datos personales
    UPDATE avisos SET contacto_telefono = NULL WHERE vecino_id = pf.persona_id;
    DELETE FROM mensajes WHERE remitente_rol = 'vecino' AND remitente_id = pf.persona_id;
    UPDATE vecinos SET nombre = 'Vecino eliminado', eliminado_at = now() WHERE id = pf.persona_id;
  ELSIF pf.rol = 'proveedor' AND pf.persona_id IS NOT NULL THEN
    DELETE FROM fcm_tokens WHERE user_id = pf.persona_id;
    DELETE FROM agenda_proveedor WHERE proveedor_id = pf.persona_id;
    UPDATE enlaces_proveedor SET revocado = true WHERE proveedor_id = pf.persona_id;
    UPDATE proveedores SET telefono = NULL, disponible = false, auth_user_id = NULL, eliminado_at = now()
      WHERE id = pf.persona_id;
  END IF;

  DELETE FROM intentos_pin WHERE auth_user_id = v_uid;
  DELETE FROM perfiles WHERE auth_user_id = v_uid;
  RETURN coalesce(pf.rol, 'sin_perfil');
END;
$$;
REVOKE ALL ON FUNCTION fh_eliminar_mis_datos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_eliminar_mis_datos() TO authenticated;

REVOKE ALL ON FUNCTION fh_admin_autorizar(UUID, UUID), fh_admin_rechazar(UUID, TEXT), fh_admin_pedir_info(UUID, TEXT),
  fh_proveedor_aceptar(UUID), fh_proveedor_no_puede(UUID, TEXT), fh_proveedor_finalizar(UUID, NUMERIC, TEXT, JSONB),
  fh_confirmar_resuelto(UUID), fh_admin_desvincular_proveedor(UUID), fh_aceptar_terminos(TEXT),
  fh_mis_edificios(), fh_agregar_edificio_admin(TEXT), fh_enviar_reporte(UUID), fh_vecino_responder_info(UUID, TEXT), fh_admin_reasignar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_admin_autorizar(UUID, UUID), fh_admin_rechazar(UUID, TEXT), fh_admin_pedir_info(UUID, TEXT),
  fh_proveedor_aceptar(UUID), fh_proveedor_no_puede(UUID, TEXT), fh_proveedor_finalizar(UUID, NUMERIC, TEXT, JSONB),
  fh_confirmar_resuelto(UUID), fh_admin_desvincular_proveedor(UUID), fh_aceptar_terminos(TEXT),
  fh_mis_edificios(), fh_agregar_edificio_admin(TEXT), fh_enviar_reporte(UUID), fh_vecino_responder_info(UUID, TEXT), fh_admin_reasignar(UUID) TO authenticated;


-- ============================================================================
-- SECCIÓN 8 — Funciones de apoyo para las políticas
-- ============================================================================
CREATE OR REPLACE FUNCTION fh_puede_ver_aviso(p_aviso UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_aviso IS NOT NULL AND (fh_es_infra() OR EXISTS (
    SELECT 1 FROM avisos a WHERE a.id = p_aviso AND (
      (a.edificio_id IN (SELECT fh_edificios_admin()) AND a.enviado_at IS NOT NULL)
      OR (fh_rol() = 'vecino'    AND a.vecino_id    = fh_persona_id())
      OR (fh_rol() = 'proveedor' AND a.proveedor_id = fh_persona_id())
    )))
$$;

-- El proveedor puede ver el vecino (nombre/unidad) SOLO de los trabajos que tiene asignados
CREATE OR REPLACE FUNCTION fh_vecino_de_mi_trabajo(p_vecino UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT fh_rol() = 'proveedor' AND EXISTS (
    SELECT 1 FROM avisos a WHERE a.vecino_id = p_vecino AND a.proveedor_id = fh_persona_id()
      AND a.fase IN ('derivado','en_camino','finalizado_proveedor'))
$$;

CREATE OR REPLACE FUNCTION fh_anuncio_visible(p_anuncio UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT fh_rol() IN ('vecino','admin') AND EXISTS (
    SELECT 1 FROM anuncios a WHERE a.id = p_anuncio AND fh_es_mi_edificio(a.edificio_id))
$$;


-- ============================================================================
-- SECCIÓN 9 — POLÍTICAS DE SEGURIDAD (RLS), reescritas desde cero
-- Regla general: cada persona ve y toca SOLO lo que le corresponde por su rol.
-- ============================================================================
DO $$
DECLARE t TEXT; pol RECORD;
  tablas TEXT[] := ARRAY['edificios','vecinos','proveedores','avisos','mensajes','anuncios','reservas','recordatorios',
    'agenda_proveedor','votaciones','votos','encuestas','respuestas_encuesta','emergencias','visitas',
    'reacciones_anuncio','mensajes_privados','votos_tablon','fcm_tokens','notificaciones_programadas','perfiles','reglas_autorizacion'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- borrar TODAS las políticas viejas de la tabla (incluidas las de v31)
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    -- INFRA (panel maestro) puede administrar todo
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (fh_es_infra()) WITH CHECK (fh_es_infra())', t || '_infra', t);
  END LOOP;
END $$;

-- El rol anónimo (sin sesión) no toca ninguna tabla
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- ---- perfiles: cada uno lee SOLO el suyo; nadie escribe desde el navegador ----
CREATE POLICY perfiles_ver_propio ON perfiles FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON perfiles FROM authenticated;

-- ---- edificios: se ve el propio, pero NUNCA la columna del PIN ----
CREATE POLICY edificios_ver_el_mio ON edificios FOR SELECT TO authenticated USING (fh_es_mi_edificio(id));
DO $$
DECLARE cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'edificios' AND column_name NOT IN ('pin_admin','admin_pin');
  EXECUTE 'REVOKE SELECT ON edificios FROM authenticated';
  EXECUTE 'GRANT SELECT (' || cols || ') ON edificios TO authenticated';
END $$;

-- ---- vecinos ----
CREATE POLICY vecinos_ver ON vecinos FOR SELECT TO authenticated USING (
  fh_es_admin_de(edificio_id)
  OR (fh_rol() = 'vecino' AND id = fh_persona_id())
  OR fh_vecino_de_mi_trabajo(id)
);
-- (alta/edición: solo por las funciones fh_vincular_vecino y fh_eliminar_mis_datos)

-- ---- proveedores: los ve el admin y el propio proveedor. Los vecinos NO. ----
CREATE POLICY proveedores_ver ON proveedores FOR SELECT TO authenticated USING (
  fh_es_admin_de(edificio_id) OR (fh_rol() = 'proveedor' AND id = fh_persona_id())
);
CREATE POLICY proveedores_alta ON proveedores FOR INSERT TO authenticated WITH CHECK (fh_es_admin_de(edificio_id));
CREATE POLICY proveedores_editar ON proveedores FOR UPDATE TO authenticated
  USING (fh_es_admin_de(edificio_id) OR (fh_rol() = 'proveedor' AND id = fh_persona_id()))
  WITH CHECK (fh_es_admin_de(edificio_id) OR (fh_rol() = 'proveedor' AND id = fh_persona_id()));
CREATE POLICY proveedores_borrar ON proveedores FOR DELETE TO authenticated USING (fh_es_admin_de(edificio_id));

-- ---- avisos (reclamos) ----
CREATE POLICY avisos_ver ON avisos FOR SELECT TO authenticated USING (
  (fh_es_admin_de(edificio_id) AND enviado_at IS NOT NULL)
  OR (fh_rol() = 'vecino'    AND vecino_id    = fh_persona_id())
  OR (fh_rol() = 'proveedor' AND proveedor_id = fh_persona_id())
);
CREATE POLICY avisos_crear ON avisos FOR INSERT TO authenticated WITH CHECK (
  fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND edificio_id = fh_edificio_id()
);
-- El vecino solo edita su reclamo mientras el admin todavía no lo autorizó
CREATE POLICY avisos_editar_vecino ON avisos FOR UPDATE TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fase IN ('pendiente_admin','info_solicitada'))
  WITH CHECK (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fase IN ('pendiente_admin','info_solicitada'));
CREATE POLICY avisos_borrar_vecino ON avisos FOR DELETE TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fase IN ('pendiente_admin','info_solicitada'));
-- Y aun así, solo puede tocar estas columnas (fase, proveedor, monto, etc. solo las cambian las funciones)
REVOKE UPDATE ON avisos FROM authenticated;
GRANT UPDATE (titulo, descripcion, urgencia, adjuntos, contacto_telefono) ON avisos TO authenticated;

-- ---- mensajes del reclamo ----
CREATE POLICY mensajes_ver ON mensajes FOR SELECT TO authenticated USING (
  fh_puede_ver_aviso(aviso_id) AND (coalesce(es_nota_interna, false) = false OR fh_rol() = 'admin')
);
CREATE POLICY mensajes_enviar ON mensajes FOR INSERT TO authenticated WITH CHECK (
  fh_puede_ver_aviso(aviso_id) AND remitente_rol = fh_rol()
  AND (coalesce(es_nota_interna, false) = false OR fh_rol() = 'admin')
);
CREATE POLICY mensajes_editar ON mensajes FOR UPDATE TO authenticated
  USING (fh_puede_ver_aviso(aviso_id) AND coalesce(es_nota_interna, false) = false)
  WITH CHECK (fh_puede_ver_aviso(aviso_id));
REVOKE UPDATE ON mensajes FROM authenticated;
GRANT UPDATE (contenido, editado, leido) ON mensajes TO authenticated;

-- ---- lo que publica el admin y leen los vecinos ----
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['anuncios','emergencias','votaciones','encuestas'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (fh_rol() IN (''vecino'',''admin'') AND fh_es_mi_edificio(edificio_id))', t || '_leer', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (fh_es_admin_de(edificio_id)) WITH CHECK (fh_es_admin_de(edificio_id))', t || '_admin', t);
  END LOOP;
END $$;

CREATE POLICY recordatorios_admin ON recordatorios FOR ALL TO authenticated
  USING (fh_es_admin_de(edificio_id)) WITH CHECK (fh_es_admin_de(edificio_id));

-- ---- lo que crea cada vecino (reservas, visitas, votos, encuestas) ----
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['reservas','visitas','votos','respuestas_encuesta'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (fh_es_admin_de(edificio_id)) WITH CHECK (fh_es_admin_de(edificio_id))', t || '_admin', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (fh_rol() = ''vecino'' AND vecino_id = fh_persona_id() AND edificio_id = fh_edificio_id()) WITH CHECK (fh_rol() = ''vecino'' AND vecino_id = fh_persona_id() AND edificio_id = fh_edificio_id())', t || '_propio', t);
  END LOOP;
END $$;
-- Reservas: todos los vecinos ven las reservas del edificio (para no pisarse horarios)
CREATE POLICY reservas_ver_edificio ON reservas FOR SELECT TO authenticated
  USING (fh_rol() = 'vecino' AND edificio_id = fh_edificio_id());

-- ---- reacciones y votos del Tablón (no tienen edificio_id: se resuelve por el anuncio) ----
CREATE POLICY reacciones_ver ON reacciones_anuncio FOR SELECT TO authenticated USING (fh_anuncio_visible(anuncio_id));
CREATE POLICY reacciones_propias ON reacciones_anuncio FOR ALL TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id())
  WITH CHECK (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fh_anuncio_visible(anuncio_id));
CREATE POLICY votos_tablon_ver ON votos_tablon FOR SELECT TO authenticated USING (fh_anuncio_visible(anuncio_id));
CREATE POLICY votos_tablon_propios ON votos_tablon FOR ALL TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id())
  WITH CHECK (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fh_anuncio_visible(anuncio_id));

-- ---- chat privado vecino <-> admin ----
CREATE POLICY mensajes_privados_admin ON mensajes_privados FOR ALL TO authenticated
  USING (fh_es_admin_de(edificio_id)) WITH CHECK (fh_es_admin_de(edificio_id) AND autor = 'admin');
CREATE POLICY mensajes_privados_vecino ON mensajes_privados FOR ALL TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id())
  WITH CHECK (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND edificio_id = fh_edificio_id() AND autor = 'vecino');

-- ---- agenda del proveedor ----
CREATE POLICY agenda_propia ON agenda_proveedor FOR ALL TO authenticated
  USING (fh_rol() = 'proveedor' AND proveedor_id = fh_persona_id())
  WITH CHECK (fh_rol() = 'proveedor' AND proveedor_id = fh_persona_id());
CREATE POLICY agenda_admin_ver ON agenda_proveedor FOR SELECT TO authenticated
  USING (proveedor_id IN (SELECT p.id FROM proveedores p WHERE fh_es_admin_de(p.edificio_id)));

-- ---- tokens de notificaciones: cada uno ve/borra los suyos; se registran con fh_registrar_token ----
CREATE POLICY fcm_ver_propios ON fcm_tokens FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY fcm_borrar_propios ON fcm_tokens FOR DELETE TO authenticated USING (auth_user_id = auth.uid());
REVOKE INSERT, UPDATE ON fcm_tokens FROM authenticated;

-- ---- reglas automáticas: solo el admin del edificio ----
CREATE POLICY reglas_admin ON reglas_autorizacion FOR ALL TO authenticated
  USING (fh_es_admin_de(edificio_id)) WITH CHECK (fh_es_admin_de(edificio_id));

-- notificaciones_programadas: solo INFRA (política *_infra de arriba)
-- enlaces_proveedor e intentos_pin: sin política = solo el servidor


-- ============================================================================
-- SECCIÓN 10 — Storage: bucket PRIVADO para fotos, videos y remitos
-- Ruta de cada archivo: <edificio_id>/<aviso_id>/<archivo>
-- Solo lo ven: el vecino que reportó, el admin del edificio y el proveedor asignado.
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('adjuntos', 'adjuntos', false, 31457280,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 31457280,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm','application/pdf'];

DROP POLICY IF EXISTS adjuntos_ver    ON storage.objects;
DROP POLICY IF EXISTS adjuntos_subir  ON storage.objects;
CREATE POLICY adjuntos_ver ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'adjuntos' AND fh_puede_ver_aviso(fh_uuid_safe((storage.foldername(name))[2])));
CREATE POLICY adjuntos_subir ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'adjuntos' AND fh_puede_ver_aviso(fh_uuid_safe((storage.foldername(name))[2])));

-- El bucket viejo (público) queda solo de lectura para que se sigan viendo las
-- fotos de chats anteriores. Ya no se puede subir nada nuevo sin estar logueado.
DROP POLICY IF EXISTS "Subida publica chat imagenes" ON storage.objects;

-- ============================================================================
-- FIN. Después de correrlo, seguí SETUP_v33.md (variables nuevas en Netlify).
-- ============================================================================
