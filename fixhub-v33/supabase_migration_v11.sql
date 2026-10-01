-- Migración v11
-- Habilita Supabase Realtime en las tablas que la app escucha en vivo.
-- Sin esto, los mensajes de chat y los avisos actualizados NO aparecen solos:
-- hace falta salir y volver a entrar para que se note el cambio (justo el bug
-- que reportaste). Esto es una configuración del proyecto de Supabase, no del
-- código de la app — probablemente nunca se activó.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'mensajes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensajes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'avisos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE avisos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'mensajes_privados'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensajes_privados;
  END IF;
END $$;
