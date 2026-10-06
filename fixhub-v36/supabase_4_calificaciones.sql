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
