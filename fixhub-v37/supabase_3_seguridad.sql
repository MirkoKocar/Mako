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
