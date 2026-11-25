-- FixHub / MAKO: todas las partes (1 a 6) en un solo archivo. Se corren en orden; son idempotentes.
-- Si ya tenés las partes 1-4, corré solo desde 'PARTE 5' hacia abajo.

-- ======================================================================
-- PARTE 1  (supabase_1_estructura_y_flujo.sql)
-- ======================================================================
-- FIXHUB — PARTE 1 de 3: tablas, columnas, validaciones y el flujo de reportes.
-- Supabase > SQL Editor > New query > pegar todo > Run. Si ya la corriste, se puede volver a correr.

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

CREATE OR REPLACE FUNCTION fh_es_admin_de(p_edificio_id UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_edificio_id IS NOT NULL AND p_edificio_id IN (SELECT fh_edificios_admin())
$$;

CREATE OR REPLACE FUNCTION fh_uuid_safe(p_txt TEXT) RETURNS UUID
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p_txt::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

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

ALTER TABLE edificios ADD COLUMN IF NOT EXISTS tiene_pin BOOLEAN GENERATED ALWAYS AS (pin_admin IS NOT NULL) STORED;

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

ALTER TABLE avisos   DROP CONSTRAINT IF EXISTS avisos_proveedor_id_fkey;
ALTER TABLE avisos   ADD  CONSTRAINT avisos_proveedor_id_fkey   FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_proveedor_id_fkey;
ALTER TABLE mensajes ADD  CONSTRAINT mensajes_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;

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

CREATE OR REPLACE FUNCTION fh_avisos_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r reglas_autorizacion%ROWTYPE;
  v_costo NUMERIC;
BEGIN
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

-- ======================================================================
-- PARTE 2  (supabase_2_login_y_cuenta.sql)
-- ======================================================================
-- FIXHUB — PARTE 2 de 3: ingreso, vinculación de cuentas y eliminar cuenta. Correr DESPUÉS de la parte 1.
-- Supabase > SQL Editor > New query > pegar todo > Run. Si ya la corriste, se puede volver a correr.

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

CREATE OR REPLACE FUNCTION fh_agregar_edificio_admin(p_codigo TEXT)
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT, codigo_acceso TEXT, estado_pago TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id, e.nombre, e.direccion, e.codigo_acceso, e.estado_pago FROM edificios e
  WHERE e.codigo_acceso = upper(btrim(p_codigo)) AND e.id IN (SELECT fh_edificios_admin()) LIMIT 1
$$;

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

DO $$ BEGIN
  BEGIN REVOKE EXECUTE ON FUNCTION fh_verificar_pin(UUID, TEXT)    FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION fh_buscar_vecino(UUID, TEXT)    FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION fh_buscar_proveedor(UUID, TEXT) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

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

CREATE OR REPLACE FUNCTION fh_puede_ver_aviso(p_aviso UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_aviso IS NOT NULL AND (fh_es_infra() OR EXISTS (
    SELECT 1 FROM avisos a WHERE a.id = p_aviso AND (
      (a.edificio_id IN (SELECT fh_edificios_admin()) AND a.enviado_at IS NOT NULL)
      OR (fh_rol() = 'vecino'    AND a.vecino_id    = fh_persona_id())
      OR (fh_rol() = 'proveedor' AND a.proveedor_id = fh_persona_id())
    )))
$$;

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

-- ======================================================================
-- PARTE 3  (supabase_3_seguridad.sql)
-- ======================================================================
-- FIXHUB — PARTE 3 de 3: políticas de seguridad (RLS) y almacenamiento privado. Correr al FINAL.
-- Supabase > SQL Editor > New query > pegar todo > Run. Si ya la corriste, se puede volver a correr.

DO $$
DECLARE t TEXT; pol RECORD;
  tablas TEXT[] := ARRAY['edificios','vecinos','proveedores','avisos','mensajes','anuncios','reservas','recordatorios',
    'agenda_proveedor','votaciones','votos','encuestas','respuestas_encuesta','emergencias','visitas',
    'reacciones_anuncio','mensajes_privados','votos_tablon','fcm_tokens','notificaciones_programadas','perfiles','reglas_autorizacion'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (fh_es_infra()) WITH CHECK (fh_es_infra())', t || '_infra', t);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

CREATE POLICY perfiles_ver_propio ON perfiles FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON perfiles FROM authenticated;

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

CREATE POLICY vecinos_ver ON vecinos FOR SELECT TO authenticated USING (
  fh_es_admin_de(edificio_id)
  OR (fh_rol() = 'vecino' AND id = fh_persona_id())
  OR fh_vecino_de_mi_trabajo(id)
);

CREATE POLICY proveedores_ver ON proveedores FOR SELECT TO authenticated USING (
  fh_es_admin_de(edificio_id) OR (fh_rol() = 'proveedor' AND id = fh_persona_id())
);
CREATE POLICY proveedores_alta ON proveedores FOR INSERT TO authenticated WITH CHECK (fh_es_admin_de(edificio_id));
CREATE POLICY proveedores_editar ON proveedores FOR UPDATE TO authenticated
  USING (fh_es_admin_de(edificio_id) OR (fh_rol() = 'proveedor' AND id = fh_persona_id()))
  WITH CHECK (fh_es_admin_de(edificio_id) OR (fh_rol() = 'proveedor' AND id = fh_persona_id()));
CREATE POLICY proveedores_borrar ON proveedores FOR DELETE TO authenticated USING (fh_es_admin_de(edificio_id));

CREATE POLICY avisos_ver ON avisos FOR SELECT TO authenticated USING (
  (fh_es_admin_de(edificio_id) AND enviado_at IS NOT NULL)
  OR (fh_rol() = 'vecino'    AND vecino_id    = fh_persona_id())
  OR (fh_rol() = 'proveedor' AND proveedor_id = fh_persona_id())
);
CREATE POLICY avisos_crear ON avisos FOR INSERT TO authenticated WITH CHECK (
  fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND edificio_id = fh_edificio_id()
);
CREATE POLICY avisos_editar_vecino ON avisos FOR UPDATE TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fase IN ('pendiente_admin','info_solicitada'))
  WITH CHECK (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fase IN ('pendiente_admin','info_solicitada'));
CREATE POLICY avisos_borrar_vecino ON avisos FOR DELETE TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fase IN ('pendiente_admin','info_solicitada'));
REVOKE UPDATE ON avisos FROM authenticated;
GRANT UPDATE (titulo, descripcion, urgencia, adjuntos, contacto_telefono) ON avisos TO authenticated;

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

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['reservas','visitas','votos','respuestas_encuesta'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (fh_es_admin_de(edificio_id)) WITH CHECK (fh_es_admin_de(edificio_id))', t || '_admin', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (fh_rol() = ''vecino'' AND vecino_id = fh_persona_id() AND edificio_id = fh_edificio_id()) WITH CHECK (fh_rol() = ''vecino'' AND vecino_id = fh_persona_id() AND edificio_id = fh_edificio_id())', t || '_propio', t);
  END LOOP;
END $$;
CREATE POLICY reservas_ver_edificio ON reservas FOR SELECT TO authenticated
  USING (fh_rol() = 'vecino' AND edificio_id = fh_edificio_id());

CREATE POLICY reacciones_ver ON reacciones_anuncio FOR SELECT TO authenticated USING (fh_anuncio_visible(anuncio_id));
CREATE POLICY reacciones_propias ON reacciones_anuncio FOR ALL TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id())
  WITH CHECK (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fh_anuncio_visible(anuncio_id));
CREATE POLICY votos_tablon_ver ON votos_tablon FOR SELECT TO authenticated USING (fh_anuncio_visible(anuncio_id));
CREATE POLICY votos_tablon_propios ON votos_tablon FOR ALL TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id())
  WITH CHECK (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND fh_anuncio_visible(anuncio_id));

CREATE POLICY mensajes_privados_admin ON mensajes_privados FOR ALL TO authenticated
  USING (fh_es_admin_de(edificio_id)) WITH CHECK (fh_es_admin_de(edificio_id) AND autor = 'admin');
CREATE POLICY mensajes_privados_vecino ON mensajes_privados FOR ALL TO authenticated
  USING (fh_rol() = 'vecino' AND vecino_id = fh_persona_id())
  WITH CHECK (fh_rol() = 'vecino' AND vecino_id = fh_persona_id() AND edificio_id = fh_edificio_id() AND autor = 'vecino');

CREATE POLICY agenda_propia ON agenda_proveedor FOR ALL TO authenticated
  USING (fh_rol() = 'proveedor' AND proveedor_id = fh_persona_id())
  WITH CHECK (fh_rol() = 'proveedor' AND proveedor_id = fh_persona_id());
CREATE POLICY agenda_admin_ver ON agenda_proveedor FOR SELECT TO authenticated
  USING (proveedor_id IN (SELECT p.id FROM proveedores p WHERE fh_es_admin_de(p.edificio_id)));

CREATE POLICY fcm_ver_propios ON fcm_tokens FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY fcm_borrar_propios ON fcm_tokens FOR DELETE TO authenticated USING (auth_user_id = auth.uid());
REVOKE INSERT, UPDATE ON fcm_tokens FROM authenticated;

CREATE POLICY reglas_admin ON reglas_autorizacion FOR ALL TO authenticated
  USING (fh_es_admin_de(edificio_id)) WITH CHECK (fh_es_admin_de(edificio_id));

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

DROP POLICY IF EXISTS "Subida publica chat imagenes" ON storage.objects;

-- ======================================================================
-- PARTE 4  (supabase_4_calificaciones.sql)
-- ======================================================================
-- FIXHUB — PARTE 4 (v36): calificaciones de proveedores, gestión privada, remito opcional.
-- Correr DESPUÉS de las partes 1, 2 y 3. Si ya la corriste, se puede volver a correr.

ALTER TABLE avisos ADD COLUMN IF NOT EXISTS contacto_privado TEXT;
ALTER TABLE avisos DROP CONSTRAINT IF EXISTS avisos_fase_chk;
ALTER TABLE avisos ADD CONSTRAINT avisos_fase_chk CHECK (fase IN
  ('pendiente_admin','info_solicitada','rechazado','derivado','en_camino','finalizado_proveedor','cerrado','privado')) NOT VALID;

CREATE TABLE IF NOT EXISTS calificaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aviso_id UUID NOT NULL UNIQUE REFERENCES avisos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  edificio_id UUID NOT NULL REFERENCES edificios(id) ON DELETE CASCADE,
  vecino_id UUID REFERENCES vecinos(id) ON DELETE SET NULL,
  estrellas INTEGER NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  resena TEXT CHECK (resena IS NULL OR char_length(resena) <= 300),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calif_proveedor ON calificaciones(proveedor_id);
ALTER TABLE calificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calificaciones_infra ON calificaciones;
DROP POLICY IF EXISTS calificaciones_ver ON calificaciones;
CREATE POLICY calificaciones_infra ON calificaciones FOR ALL TO authenticated USING (fh_es_infra()) WITH CHECK (fh_es_infra());
CREATE POLICY calificaciones_ver ON calificaciones FOR SELECT TO authenticated USING (
  fh_es_admin_de(edificio_id)
  OR (fh_rol() = 'vecino' AND vecino_id = fh_persona_id())
);
REVOKE INSERT, UPDATE, DELETE ON calificaciones FROM authenticated;

DROP TRIGGER IF EXISTS trg_calif_ranking ON calificaciones;
DROP FUNCTION IF EXISTS fh_calif_ranking();

CREATE OR REPLACE FUNCTION fh_calificar(p_aviso UUID, p_estrellas INT, p_resena TEXT)
RETURNS calificaciones LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res calificaciones; v_txt TEXT := NULLIF(left(btrim(coalesce(p_resena,'')), 300), '');
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR fh_rol() IS DISTINCT FROM 'vecino' OR a.vecino_id IS DISTINCT FROM fh_persona_id() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('finalizado_proveedor','cerrado') OR a.proveedor_id IS NULL THEN RAISE EXCEPTION 'Todavía no se puede calificar este trabajo'; END IF;
  IF p_estrellas IS NULL OR p_estrellas < 1 OR p_estrellas > 5 THEN RAISE EXCEPTION 'Elegí de 1 a 5 estrellas'; END IF;
  INSERT INTO calificaciones (aviso_id, proveedor_id, edificio_id, vecino_id, estrellas, resena)
  VALUES (a.id, a.proveedor_id, a.edificio_id, a.vecino_id, p_estrellas, v_txt)
  ON CONFLICT (aviso_id) DO UPDATE SET estrellas = EXCLUDED.estrellas, resena = EXCLUDED.resena
  RETURNING * INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION fh_resenas_proveedor(p_proveedor UUID)
RETURNS TABLE(promedio NUMERIC, cantidad BIGINT, resenas JSONB)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE p proveedores;
BEGIN
  SELECT * INTO p FROM proveedores WHERE id = p_proveedor;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT (fh_es_admin_de(p.edificio_id) OR fh_es_infra()
    OR (fh_rol() = 'vecino' AND EXISTS (SELECT 1 FROM avisos a WHERE a.proveedor_id = p.id AND a.vecino_id = fh_persona_id()))) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  RETURN QUERY SELECT round(avg(c.estrellas)::numeric, 1), count(*),
    coalesce((SELECT jsonb_agg(x ORDER BY x->>'fecha' DESC) FROM (
      SELECT jsonb_build_object('estrellas', c2.estrellas, 'resena', c2.resena, 'fecha', c2.created_at) AS x
      FROM calificaciones c2 WHERE c2.proveedor_id = p.id AND c2.resena IS NOT NULL ORDER BY c2.created_at DESC LIMIT 10) t), '[]'::jsonb)
  FROM calificaciones c WHERE c.proveedor_id = p.id;
END;
$$;

CREATE OR REPLACE FUNCTION fh_calificaciones_edificio(p_edificio UUID)
RETURNS TABLE(proveedor_id UUID, promedio NUMERIC, cantidad BIGINT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT (fh_es_admin_de(p_edificio) OR fh_es_infra()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY SELECT c.proveedor_id, round(avg(c.estrellas)::numeric, 1), count(*) FROM calificaciones c WHERE c.edificio_id = p_edificio GROUP BY c.proveedor_id;
END;
$$;

CREATE OR REPLACE FUNCTION fh_admin_derivar_privado(p_aviso UUID, p_nombre TEXT, p_telefono TEXT)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; v_nom TEXT := btrim(coalesce(p_nombre,'')); v_tel TEXT := regexp_replace(coalesce(p_telefono,''), '\D', '', 'g');
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR NOT fh_es_admin_de(a.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('pendiente_admin','info_solicitada') THEN RAISE EXCEPTION 'Este reclamo ya no está pendiente de autorización'; END IF;
  IF char_length(v_nom) < 2 OR char_length(v_nom) > 60 THEN RAISE EXCEPTION 'Escribí el nombre del proveedor'; END IF;
  IF char_length(v_tel) < 10 OR char_length(v_tel) > 15 THEN RAISE EXCEPTION 'El teléfono no parece válido (10 a 15 dígitos, con código de área)'; END IF;
  UPDATE avisos SET fase = 'privado', estado = 'resuelto', proveedor_nombre = v_nom, contacto_privado = v_tel,
    pendiente_aprobacion = false, cerrado_at = now(), updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  INSERT INTO mensajes_privados (edificio_id, vecino_id, aviso_id, autor, contenido, leido)
  VALUES (a.edificio_id, a.vecino_id, a.id, 'admin',
    'Sobre tu reporte "' || left(a.titulo, 80) || '": te recomendamos contactar a ' || v_nom || ' al ' || v_tel || ' y coordinar directamente con esa persona.', false);
  RETURN res;
END;
$$;

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
  p_adjuntos := coalesce(p_adjuntos, '[]'::jsonb);
  IF jsonb_typeof(p_adjuntos) <> 'array' OR jsonb_array_length(p_adjuntos) > 10 THEN
    RAISE EXCEPTION 'Adjuntos inválidos (máximo 10)';
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
    UPDATE avisos SET contacto_telefono = NULL WHERE vecino_id = pf.persona_id;
    UPDATE calificaciones SET vecino_id = NULL WHERE vecino_id = pf.persona_id;
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

REVOKE ALL ON FUNCTION fh_calificar(UUID, INT, TEXT), fh_resenas_proveedor(UUID), fh_calificaciones_edificio(UUID), fh_admin_derivar_privado(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_calificar(UUID, INT, TEXT), fh_resenas_proveedor(UUID), fh_calificaciones_edificio(UUID), fh_admin_derivar_privado(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fh_proveedor_finalizar(UUID, NUMERIC, TEXT, JSONB), fh_eliminar_mis_datos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_proveedor_finalizar(UUID, NUMERIC, TEXT, JSONB), fh_eliminar_mis_datos() TO authenticated;

-- ======================================================================
-- PARTE 5  (supabase_5_enlace_proveedor.sql)
-- ======================================================================
-- FIXHUB — PARTE 5 (v38): link seguro del proveedor, chat supervisado, acuerdos y WhatsApp.
-- Correr DESPUÉS de las partes 1 a 4 (Supabase > SQL Editor > New query > pegar todo > Run).
-- Es idempotente: se puede volver a correr. No modifica los archivos anteriores.
-- Para saber si ya la pegaste:  select to_regclass('public.acuerdos') is not null;  -> true = ya está.

-- ============================================================================
-- 1. LINKS DEL PROVEEDOR (enlaces_proveedor) — sin vencimiento de 72 h
-- ============================================================================
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS token_cifrado     TEXT;          -- AES-256-GCM (clave LINK_ENC_KEY): permite reenviar el MISMO link
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS aceptado_at       TIMESTAMPTZ;   -- el proveedor aceptó los términos (una sola vez)
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS primer_acceso_at  TIMESTAMPTZ;
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS ultimo_acceso_at  TIMESTAMPTZ;   -- también sirve para saber si tiene la página abierta (< 60 s)
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS revocado_at       TIMESTAMPTZ;
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS revocado_motivo   TEXT;
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS wa_pendiente      BOOLEAN NOT NULL DEFAULT false;   -- hay novedades por avisar por WhatsApp
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS wa_mensajes_hasta TIMESTAMPTZ;   -- mensajes anteriores a esta fecha ya se avisaron / se vieron
ALTER TABLE enlaces_proveedor ADD COLUMN IF NOT EXISTS wa_acuerdo_pendiente TEXT;       -- novedad del acuerdo todavía no avisada

-- Los links que ya existían (v37) dejan de vencer a las 72 h: tope de seguridad de 60 días desde que se crearon
UPDATE enlaces_proveedor SET expires_at = created_at + interval '60 days'
WHERE revocado = false AND expires_at < created_at + interval '60 days';

CREATE INDEX IF NOT EXISTS idx_enlaces_wa_pendiente ON enlaces_proveedor(wa_pendiente) WHERE wa_pendiente = true AND revocado = false;

-- Un solo link activo por trabajo (si hubiera duplicados viejos, se omite sin romper nada)
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_enlace_activo_por_aviso ON enlaces_proveedor(aviso_id) WHERE revocado = false;
EXCEPTION WHEN others THEN NULL; END $$;

-- Auditoría: quién abrió el link y qué hizo (no guarda IP en claro ni el token)
CREATE TABLE IF NOT EXISTS enlace_eventos (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enlace_id  UUID NOT NULL REFERENCES enlaces_proveedor(id) ON DELETE CASCADE,
  evento     TEXT NOT NULL CHECK (char_length(evento) <= 60),
  ip_hash    TEXT,
  user_agent TEXT CHECK (user_agent IS NULL OR char_length(user_agent) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enlace_eventos ON enlace_eventos(enlace_id, created_at DESC);

-- Límite de intentos fallidos por IP (en la base, no en memoria: sobrevive entre instancias de la función)
CREATE TABLE IF NOT EXISTS intentos_enlace (
  ip_hash        TEXT PRIMARY KEY,
  fallos         INTEGER NOT NULL DEFAULT 0,
  ventana_inicio TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fh_enlace_bloqueado(p_ip_hash TEXT, p_max INT, p_ventana_seg INT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT fallos >= p_max AND ventana_inicio > now() - make_interval(secs => p_ventana_seg)
                   FROM intentos_enlace WHERE ip_hash = p_ip_hash), false)
$$;

CREATE OR REPLACE FUNCTION fh_enlace_fallo(p_ip_hash TEXT, p_max INT, p_ventana_seg INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v INT;
BEGIN
  INSERT INTO intentos_enlace (ip_hash, fallos, ventana_inicio) VALUES (p_ip_hash, 1, now())
  ON CONFLICT (ip_hash) DO UPDATE SET
    fallos = CASE WHEN intentos_enlace.ventana_inicio < now() - make_interval(secs => p_ventana_seg) THEN 1 ELSE intentos_enlace.fallos + 1 END,
    ventana_inicio = CASE WHEN intentos_enlace.ventana_inicio < now() - make_interval(secs => p_ventana_seg) THEN now() ELSE intentos_enlace.ventana_inicio END
  RETURNING fallos INTO v;
  RETURN v >= p_max;
END;
$$;

-- El link se revoca solo cuando el reporte sale de las fases activas o cambia el proveedor
-- (el servidor además lo valida en cada request: esto es un segundo seguro).
CREATE OR REPLACE FUNCTION fh_avisos_revocar_enlaces() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.proveedor_id IS NULL OR NEW.fase NOT IN ('derivado','en_camino','finalizado_proveedor') THEN
    UPDATE enlaces_proveedor SET revocado = true, revocado_at = now(), revocado_motivo = coalesce(revocado_motivo, 'fase:' || NEW.fase)
    WHERE aviso_id = NEW.id AND revocado = false;
  ELSIF OLD.proveedor_id IS DISTINCT FROM NEW.proveedor_id THEN
    UPDATE enlaces_proveedor SET revocado = true, revocado_at = now(), revocado_motivo = coalesce(revocado_motivo, 'reasignado')
    WHERE aviso_id = NEW.id AND revocado = false AND proveedor_id IS DISTINCT FROM NEW.proveedor_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_avisos_revocar_enlaces ON avisos;
CREATE TRIGGER trg_avisos_revocar_enlaces AFTER UPDATE OF fase, proveedor_id ON avisos
  FOR EACH ROW EXECUTE FUNCTION fh_avisos_revocar_enlaces();

-- ============================================================================
-- 2. AVISOS: pausa del chat, nota del admin, recordatorios
-- ============================================================================
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS chat_pausado          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS chat_pausado_at       TIMESTAMPTZ;
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS nota_proveedor        TEXT;          -- nota corta del admin al derivar (la ve el proveedor)
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS presupuesto_pedido_at TIMESTAMPTZ;   -- el proveedor pidió presupuestar antes de aceptar
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS recordatorio_resp_at  TIMESTAMPTZ;   -- recordatorio "sigue esperando tu respuesta"
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS recordatorio_admin_at TIMESTAMPTZ;   -- aviso al admin para reasignar
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS recordatorio_fin_at   TIMESTAMPTZ;   -- último recordatorio de "marcá como finalizado"
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS recordatorio_fin_n    INTEGER NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE avisos ADD CONSTRAINT avisos_nota_proveedor_chk CHECK (nota_proveedor IS NULL OR char_length(nota_proveedor) <= 120) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Opción por edificio: exigir acuerdo aprobado por el admin antes de finalizar (por defecto NO, para no cambiar lo actual)
ALTER TABLE edificios ADD COLUMN IF NOT EXISTS requiere_acuerdo BOOLEAN NOT NULL DEFAULT false;
GRANT SELECT (requiere_acuerdo) ON edificios TO authenticated;

CREATE OR REPLACE FUNCTION fh_admin_set_requiere_acuerdo(p_edificio UUID, p_valor BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT fh_es_admin_de(p_edificio) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE edificios SET requiere_acuerdo = coalesce(p_valor, false) WHERE id = p_edificio;
  RETURN coalesce(p_valor, false);
END;
$$;

-- Antes de pasar a "finalizado": si el edificio exige acuerdo, tiene que haber uno aprobado por el admin.
-- Además, al cambiar de proveedor se reinician los recordatorios. Aplica a TODOS los caminos (link y app).
CREATE OR REPLACE FUNCTION fh_avisos_before_update_v38() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.fase = 'finalizado_proveedor' AND OLD.fase IS DISTINCT FROM 'finalizado_proveedor'
     AND (SELECT requiere_acuerdo FROM edificios WHERE id = NEW.edificio_id)
     AND NOT EXISTS (SELECT 1 FROM acuerdos WHERE aviso_id = NEW.id AND estado = 'aprobado_admin') THEN
    RAISE EXCEPTION 'Este edificio exige un acuerdo aprobado por el administrador antes de finalizar el trabajo';
  END IF;
  IF NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id OR (NEW.fase = 'derivado' AND OLD.fase IS DISTINCT FROM 'derivado') THEN
    NEW.recordatorio_resp_at := NULL; NEW.recordatorio_admin_at := NULL;
    NEW.recordatorio_fin_at := NULL;  NEW.recordatorio_fin_n := 0;
  END IF;
  IF NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id THEN
    NEW.presupuesto_pedido_at := NULL;
    IF NEW.proveedor_id IS NULL THEN NEW.nota_proveedor := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. ACUERDOS (visita, monto y alcance pactados) — los aprueba el admin
-- ============================================================================
CREATE TABLE IF NOT EXISTS acuerdos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aviso_id          UUID NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
  propuesto_por     TEXT NOT NULL CHECK (propuesto_por IN ('vecino','proveedor')),
  fecha_visita      DATE,
  franja            TEXT CHECK (franja IS NULL OR franja IN ('manana','tarde','noche','a_coordinar')),
  monto_presupuesto NUMERIC CHECK (monto_presupuesto IS NULL OR (monto_presupuesto >= 0 AND monto_presupuesto < 1000000000)),
  alcance           TEXT NOT NULL CHECK (char_length(alcance) BETWEEN 3 AND 300),
  estado            TEXT NOT NULL DEFAULT 'propuesto' CHECK (estado IN ('propuesto','aceptado_contraparte','aprobado_admin','rechazado','vencido')),
  aceptado_at       TIMESTAMPTZ,
  decidido_at       TIMESTAMPTZ,
  decidido_motivo   TEXT CHECK (decidido_motivo IS NULL OR char_length(decidido_motivo) <= 200),
  vence_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),   -- una propuesta sin respuesta vence
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acuerdos_aviso ON acuerdos(aviso_id, created_at DESC);
-- Una sola propuesta en curso por trabajo
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_acuerdo_en_curso ON acuerdos(aviso_id) WHERE estado IN ('propuesto','aceptado_contraparte');
EXCEPTION WHEN others THEN NULL; END $$;

-- ============================================================================
-- 4. WHATSAPP: consentimiento del proveedor y registro de envíos
-- ============================================================================
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS whatsapp_optin_at  TIMESTAMPTZ;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS whatsapp_optin_por UUID;          -- auth.uid() del admin que lo confirmó
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS whatsapp_optout_at TIMESTAMPTZ;   -- el proveedor respondió BAJA

-- El consentimiento lo sella el servidor (fecha y admin); el admin NO puede borrar una baja.
CREATE OR REPLACE FUNCTION fh_proveedores_wa_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_viejo TEXT; v_nuevo TEXT;
BEGIN
  IF auth.uid() IS NULL OR current_setting('fh.bypass', true) = 'on' THEN RETURN NEW; END IF;   -- funciones del servidor (webhooks)
  IF TG_OP = 'INSERT' THEN
    NEW.whatsapp_optout_at := NULL;
    IF NEW.whatsapp_optin_at IS NOT NULL THEN NEW.whatsapp_optin_at := now(); NEW.whatsapp_optin_por := auth.uid();
    ELSE NEW.whatsapp_optin_por := NULL; END IF;
    RETURN NEW;
  END IF;
  NEW.whatsapp_optout_at := OLD.whatsapp_optout_at;
  IF OLD.whatsapp_optin_at IS NOT NULL THEN
    NEW.whatsapp_optin_at := OLD.whatsapp_optin_at; NEW.whatsapp_optin_por := OLD.whatsapp_optin_por;
  ELSIF NEW.whatsapp_optin_at IS NOT NULL THEN
    NEW.whatsapp_optin_at := now(); NEW.whatsapp_optin_por := auth.uid();
  END IF;
  IF NEW.telefono IS DISTINCT FROM OLD.telefono THEN
    v_viejo := right(regexp_replace(coalesce(OLD.telefono, ''), '\D', '', 'g'), 10);
    v_nuevo := right(regexp_replace(coalesce(NEW.telefono, ''), '\D', '', 'g'), 10);
    IF v_viejo IS DISTINCT FROM v_nuevo THEN     -- otro número: hay que pedir consentimiento de nuevo
      NEW.whatsapp_optin_at := NULL; NEW.whatsapp_optin_por := NULL; NEW.whatsapp_optout_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proveedores_wa_guard ON proveedores;
CREATE TRIGGER trg_proveedores_wa_guard BEFORE INSERT OR UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION fh_proveedores_wa_guard();

CREATE TABLE IF NOT EXISTS notificaciones_whatsapp (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aviso_id     UUID NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
  enlace_id    UUID REFERENCES enlaces_proveedor(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  plantilla    TEXT NOT NULL CHECK (char_length(plantilla) <= 40),
  estado       TEXT NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado','entregado','leido','fallido')),
  sid          TEXT,                                     -- id del mensaje en Twilio / Meta
  canal        TEXT NOT NULL DEFAULT 'twilio',
  error        TEXT CHECK (error IS NULL OR char_length(error) <= 300),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_aviso ON notificaciones_whatsapp(aviso_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_sid ON notificaciones_whatsapp(sid) WHERE sid IS NOT NULL;

-- ============================================================================
-- 5. CHAT SUPERVISADO: datos de contacto bloqueados, pausa y moderación
-- ============================================================================
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN NOT NULL DEFAULT false;   -- tenía teléfono, email o link
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS liberado  BOOLEAN NOT NULL DEFAULT false;   -- el admin lo liberó
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS liberado_at TIMESTAMPTZ;

-- ¿El texto tiene un teléfono (8+ dígitos), un email o un link? (misma lógica que netlify/functions/lib/contacto.js)
CREATE OR REPLACE FUNCTION fh_contiene_contacto(p_txt TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT := lower(coalesce(p_txt, ''));
BEGIN
  IF v ~ '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}' THEN RETURN true; END IF;
  IF v ~ '(https?://|www\.|wa\.me|t\.me/|bit\.ly|(^|[^a-z0-9-])[a-z0-9-]{2,}\.(com\.ar|gob\.ar|com|net|org|io|app|link|ly)([^a-z0-9]|$))' THEN RETURN true; END IF;
  IF v ~ '\+?[0-9]([ ().-]?[0-9]){7,}' THEN RETURN true; END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION fh_mensajes_contacto_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pausado BOOLEAN;
BEGIN
  -- chat pausado por el admin: solo el admin puede escribir
  IF TG_OP = 'INSERT' AND NEW.remitente_rol IS DISTINCT FROM 'admin' THEN
    SELECT chat_pausado INTO v_pausado FROM avisos WHERE id = NEW.aviso_id;
    IF coalesce(v_pausado, false) THEN RAISE EXCEPTION 'El administrador pausó este chat'; END IF;
  END IF;
  -- vecino y proveedor no pueden pasarse datos de contacto: el mensaje queda retenido hasta que el admin lo libere
  IF NEW.remitente_rol IN ('vecino','proveedor') AND coalesce(NEW.es_nota_interna, false) = false THEN
    IF TG_OP = 'INSERT' OR NEW.contenido IS DISTINCT FROM OLD.contenido THEN
      NEW.bloqueado := fh_contiene_contacto(NEW.contenido);
      NEW.liberado := false; NEW.liberado_at := NULL;
    END IF;
  ELSE
    NEW.bloqueado := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mensajes_contacto_guard ON mensajes;
CREATE TRIGGER trg_mensajes_contacto_guard BEFORE INSERT OR UPDATE OF contenido ON mensajes
  FOR EACH ROW EXECUTE FUNCTION fh_mensajes_contacto_guard();

-- Quién ve qué: un mensaje retenido solo lo ve quien lo escribió y el admin (hasta que se libere)
DROP POLICY IF EXISTS mensajes_ver ON mensajes;
CREATE POLICY mensajes_ver ON mensajes FOR SELECT TO authenticated USING (
  fh_puede_ver_aviso(aviso_id)
  AND (coalesce(es_nota_interna, false) = false OR fh_rol() = 'admin')
  AND (coalesce(bloqueado, false) = false OR coalesce(liberado, false) = true OR fh_rol() = 'admin' OR remitente_rol = fh_rol())
);

DROP POLICY IF EXISTS mensajes_enviar ON mensajes;
CREATE POLICY mensajes_enviar ON mensajes FOR INSERT TO authenticated WITH CHECK (
  fh_puede_ver_aviso(aviso_id) AND remitente_rol = fh_rol()
  AND (coalesce(es_nota_interna, false) = false OR fh_rol() = 'admin')
);   -- "bloqueado" y "liberado" los calcula el trigger de arriba (ignora lo que mande el navegador)

CREATE OR REPLACE FUNCTION fh_admin_liberar_mensaje(p_mensaje UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m mensajes; a avisos;
BEGIN
  SELECT * INTO m FROM mensajes WHERE id = p_mensaje;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mensaje no encontrado'; END IF;
  SELECT * INTO a FROM avisos WHERE id = m.aviso_id;
  IF NOT FOUND OR NOT fh_es_admin_de(a.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE mensajes SET liberado = true, liberado_at = now() WHERE id = p_mensaje AND bloqueado = true AND liberado = false;
END;
$$;

CREATE OR REPLACE FUNCTION fh_admin_pausar_chat(p_aviso UUID, p_pausar BOOLEAN) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR NOT fh_es_admin_de(a.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE avisos SET chat_pausado = coalesce(p_pausar, false),
    chat_pausado_at = CASE WHEN coalesce(p_pausar, false) THEN now() ELSE NULL END, updated_at = now()
  WHERE id = p_aviso;
  RETURN coalesce(p_pausar, false);
END;
$$;

-- ============================================================================
-- 6. ACCIONES DEL PROVEEDOR POR LINK (sin sesión): mismas reglas que las funciones fh_proveedor_*,
--    pero reciben el proveedor del link en vez de usar auth.uid(). Solo las puede llamar el servidor.
-- ============================================================================
CREATE OR REPLACE FUNCTION fh_int_proveedor_aceptar(p_aviso UUID, p_proveedor UUID)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR p_proveedor IS NULL OR a.proveedor_id IS DISTINCT FROM p_proveedor THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase <> 'derivado' THEN RAISE EXCEPTION 'Este trabajo ya no está esperando tu respuesta'; END IF;
  UPDATE avisos SET fase = 'en_camino', aceptado_at = now(), updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION fh_int_proveedor_no_puede(p_aviso UUID, p_proveedor UUID, p_motivo TEXT)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; v_sig_id UUID; v_sig_nombre TEXT; v_desc UUID[]; v_motivo TEXT := left(btrim(coalesce(p_motivo,'')), 300);
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR p_proveedor IS NULL OR a.proveedor_id IS DISTINCT FROM p_proveedor THEN RAISE EXCEPTION 'No autorizado'; END IF;
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

CREATE OR REPLACE FUNCTION fh_int_proveedor_finalizar(p_aviso UUID, p_proveedor UUID, p_monto NUMERIC, p_nota TEXT, p_adjuntos JSONB)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; it JSONB; v_prefijo TEXT;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR p_proveedor IS NULL OR a.proveedor_id IS DISTINCT FROM p_proveedor THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('derivado','en_camino') THEN RAISE EXCEPTION 'Este trabajo no se puede finalizar en este momento'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 OR p_monto >= 1000000000 THEN RAISE EXCEPTION 'Ingresá un monto válido'; END IF;
  p_adjuntos := coalesce(p_adjuntos, '[]'::jsonb);
  IF jsonb_typeof(p_adjuntos) <> 'array' OR jsonb_array_length(p_adjuntos) > 10 THEN
    RAISE EXCEPTION 'Adjuntos inválidos (máximo 10)';
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

-- ============================================================================
-- 7. PERMISOS Y SEGURIDAD (RLS)
-- ============================================================================
-- Tablas nuevas: RLS activado y SIN políticas para usuarios (solo el servidor, con service role, las toca).
ALTER TABLE enlace_eventos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE intentos_enlace         ENABLE ROW LEVEL SECURITY;
ALTER TABLE acuerdos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones_whatsapp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON enlace_eventos, intentos_enlace, acuerdos, notificaciones_whatsapp FROM anon, authenticated;
REVOKE ALL ON enlaces_proveedor FROM anon, authenticated;

-- Funciones solo para el servidor
REVOKE ALL ON FUNCTION fh_enlace_bloqueado(TEXT, INT, INT), fh_enlace_fallo(TEXT, INT, INT),
  fh_int_proveedor_aceptar(UUID, UUID), fh_int_proveedor_no_puede(UUID, UUID, TEXT),
  fh_int_proveedor_finalizar(UUID, UUID, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fh_enlace_bloqueado(TEXT, INT, INT), fh_enlace_fallo(TEXT, INT, INT),
  fh_int_proveedor_aceptar(UUID, UUID), fh_int_proveedor_no_puede(UUID, UUID, TEXT),
  fh_int_proveedor_finalizar(UUID, UUID, NUMERIC, TEXT, JSONB) TO service_role;

-- Funciones del admin (usan su sesión)
REVOKE ALL ON FUNCTION fh_admin_set_requiere_acuerdo(UUID, BOOLEAN), fh_admin_liberar_mensaje(UUID),
  fh_admin_pausar_chat(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fh_admin_set_requiere_acuerdo(UUID, BOOLEAN), fh_admin_liberar_mensaje(UUID),
  fh_admin_pausar_chat(UUID, BOOLEAN) TO authenticated;

-- Triggers que dependen de las tablas de arriba
DROP TRIGGER IF EXISTS trg_avisos_before_update_v38 ON avisos;
CREATE TRIGGER trg_avisos_before_update_v38 BEFORE UPDATE ON avisos
  FOR EACH ROW EXECUTE FUNCTION fh_avisos_before_update_v38();

-- Listo. Control rápido:  select count(*) from acuerdos;  select fh_contiene_contacto('llamame al 11 5555 1234');  -> true

-- ======================================================================
-- PARTE 6  (supabase_6_asignacion_automatica.sql)
-- ======================================================================
-- FIXHUB — PARTE 6 (v39): reasignación automática cuando el proveedor no puede + mínimo de proveedores por rubro.
-- Correr DESPUÉS de las partes 1 a 5. Idempotente. No modifica los archivos anteriores.
-- Control: select column_name from information_schema.columns where table_name='avisos' and column_name='reasignado_auto_at';

-- ============================================================================
-- 1. Datos nuevos
-- ============================================================================
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS reasignado_auto_at    TIMESTAMPTZ;   -- cuándo la app lo pasó sola a otro proveedor
ALTER TABLE avisos ADD COLUMN IF NOT EXISTS reasignado_de_nombre  TEXT;          -- el proveedor que dijo "no puedo"

-- Mínimo de proveedores por rubro en cada edificio (por defecto 2: así siempre hay uno de respaldo).
-- Lo puede cambiar el equipo de la plataforma (infra) desde SQL; el administrador del edificio NO puede bajarlo.
ALTER TABLE edificios ADD COLUMN IF NOT EXISTS min_proveedores_especialidad INTEGER NOT NULL DEFAULT 2;
DO $$ BEGIN
  ALTER TABLE edificios ADD CONSTRAINT edificios_min_prov_chk CHECK (min_proveedores_especialidad BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT (min_proveedores_especialidad) ON edificios TO authenticated;

-- ============================================================================
-- 2. Elegir al siguiente proveedor: mismo edificio y mismo rubro, que no haya dicho "no puedo" en este reclamo.
--    Prefiere a quien se le puede avisar por WhatsApp (con consentimiento y sin baja), después por ranking.
-- ============================================================================
CREATE OR REPLACE FUNCTION fh_siguiente_proveedor(p_aviso UUID, p_descartados UUID[])
RETURNS TABLE (id UUID, nombre TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre
  FROM proveedores p JOIN avisos a ON a.id = p_aviso
  WHERE p.edificio_id = a.edificio_id AND p.especialidad = a.categoria
    AND p.disponible IS TRUE AND p.eliminado_at IS NULL
    AND NOT (p.id = ANY (coalesce(p_descartados, ARRAY[]::uuid[])))
  ORDER BY (p.whatsapp_optin_at IS NOT NULL AND p.whatsapp_optout_at IS NULL) DESC,
           p.ranking DESC NULLS LAST, p.created_at ASC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION fh_siguiente_proveedor(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fh_siguiente_proveedor(UUID, UUID[]) TO service_role;

-- ============================================================================
-- 3. "No puedo": SIEMPRE pasa solo al siguiente proveedor (antes solo si el reporte se había autorizado con regla automática).
--    Si no queda ninguno, vuelve al administrador. (Los avisos al admin los manda el servidor.)
-- ============================================================================
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
  SELECT s.id, s.nombre INTO v_sig_id, v_sig_nombre FROM fh_siguiente_proveedor(p_aviso, v_desc) s;

  IF v_sig_id IS NOT NULL THEN
    UPDATE avisos SET proveedor_id = v_sig_id, proveedor_nombre = v_sig_nombre, proveedores_descartados = v_desc,
      fase = 'derivado', estado = 'en_curso', derivado_at = now(), aceptado_at = NULL, enlace_enviado_at = NULL,
      motivo_no_puede = v_motivo, reasignado_auto_at = now(), reasignado_de_nombre = a.proveedor_nombre, updated_at = now()
    WHERE id = p_aviso RETURNING * INTO res;
  ELSE
    UPDATE avisos SET proveedor_id = NULL, proveedor_nombre = NULL, proveedores_descartados = v_desc,
      fase = 'pendiente_admin', estado = 'nuevo', pendiente_aprobacion = true, aceptado_at = NULL,
      derivado_at = NULL, enlace_enviado_at = NULL, motivo_no_puede = v_motivo,
      reasignado_auto_at = NULL, reasignado_de_nombre = a.proveedor_nombre, updated_at = now()
    WHERE id = p_aviso RETURNING * INTO res;
  END IF;
  RETURN res;
END;
$$;

-- Lo mismo para el proveedor que trabaja por link (sin sesión): recibe el proveedor del link en vez de auth.uid()
CREATE OR REPLACE FUNCTION fh_int_proveedor_no_puede(p_aviso UUID, p_proveedor UUID, p_motivo TEXT)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; res avisos; v_sig_id UUID; v_sig_nombre TEXT; v_desc UUID[]; v_motivo TEXT := left(btrim(coalesce(p_motivo,'')), 300);
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR p_proveedor IS NULL OR a.proveedor_id IS DISTINCT FROM p_proveedor THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('derivado','en_camino') THEN RAISE EXCEPTION 'Este trabajo ya no se puede rechazar'; END IF;
  v_desc := array_append(a.proveedores_descartados, a.proveedor_id);
  SELECT s.id, s.nombre INTO v_sig_id, v_sig_nombre FROM fh_siguiente_proveedor(p_aviso, v_desc) s;

  IF v_sig_id IS NOT NULL THEN
    UPDATE avisos SET proveedor_id = v_sig_id, proveedor_nombre = v_sig_nombre, proveedores_descartados = v_desc,
      fase = 'derivado', estado = 'en_curso', derivado_at = now(), aceptado_at = NULL, enlace_enviado_at = NULL,
      motivo_no_puede = v_motivo, reasignado_auto_at = now(), reasignado_de_nombre = a.proveedor_nombre, updated_at = now()
    WHERE id = p_aviso RETURNING * INTO res;
  ELSE
    UPDATE avisos SET proveedor_id = NULL, proveedor_nombre = NULL, proveedores_descartados = v_desc,
      fase = 'pendiente_admin', estado = 'nuevo', pendiente_aprobacion = true, aceptado_at = NULL,
      derivado_at = NULL, enlace_enviado_at = NULL, motivo_no_puede = v_motivo,
      reasignado_auto_at = NULL, reasignado_de_nombre = a.proveedor_nombre, updated_at = now()
    WHERE id = p_aviso RETURNING * INTO res;
  END IF;
  RETURN res;
END;
$$;

-- ============================================================================
-- 4. Mínimo de proveedores por rubro: para derivar un trabajo tiene que haber al menos N cargados (por defecto 2).
--    El rubro "Otro" queda afuera (no tiene proveedores específicos). Siempre queda la salida
--    "pasarle el número al vecino" (fh_admin_derivar_privado), que no pasa por acá.
-- ============================================================================
CREATE OR REPLACE FUNCTION fh_admin_autorizar(p_aviso UUID, p_proveedor UUID)
RETURNS avisos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a avisos; p proveedores; res avisos; v_total INT; v_min INT;
BEGIN
  SELECT * INTO a FROM avisos WHERE id = p_aviso;
  IF NOT FOUND OR NOT fh_es_admin_de(a.edificio_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF a.fase NOT IN ('pendiente_admin','info_solicitada') THEN RAISE EXCEPTION 'Este reclamo ya no está pendiente de autorización'; END IF;
  SELECT * INTO p FROM proveedores WHERE id = p_proveedor AND edificio_id = a.edificio_id AND eliminado_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor inválido para este edificio'; END IF;

  IF a.categoria IS DISTINCT FROM 'Otro' THEN
    SELECT min_proveedores_especialidad INTO v_min FROM edificios WHERE id = a.edificio_id;
    SELECT count(*) INTO v_total FROM proveedores WHERE edificio_id = a.edificio_id AND especialidad = a.categoria AND eliminado_at IS NULL;
    IF v_total < coalesce(v_min, 2) THEN
      RAISE EXCEPTION 'Para derivar trabajos de % tenés que cargar al menos % proveedores de ese rubro (hoy hay %). Así siempre hay uno de respaldo.', a.categoria, coalesce(v_min, 2), v_total;
    END IF;
  END IF;

  UPDATE avisos SET fase = 'derivado', estado = 'en_curso', proveedor_id = p.id, proveedor_nombre = p.nombre,
    autorizado_por = 'admin', autorizado_at = now(), derivado_at = now(), pendiente_aprobacion = false,
    motivo_info = NULL, motivo_no_puede = NULL, enlace_enviado_at = NULL,
    reasignado_auto_at = NULL, reasignado_de_nombre = NULL, updated_at = now()
  WHERE id = p_aviso RETURNING * INTO res;
  RETURN res;
END;
$$;
