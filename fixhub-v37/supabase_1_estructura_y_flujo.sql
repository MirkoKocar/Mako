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
