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
