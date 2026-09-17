-- ============================================================================
-- FixHub v31 — Control de cobro (estado de pago por edificio)
-- ============================================================================
-- Qué hace: agrega una columna para marcar cada edificio como activo,
-- moroso o en período de prueba, y actualiza las funciones de login para
-- que un edificio moroso no pueda seguir usando la app hasta regularizar.
--
-- CÓMO APLICAR: igual que el archivo anterior — Supabase → SQL Editor →
-- pegar todo → Run. Se puede correr en cualquier momento, no rompe nada de
-- lo que ya está.
-- ============================================================================

ALTER TABLE edificios ADD COLUMN IF NOT EXISTS estado_pago TEXT DEFAULT 'activo';
-- Valores esperados: 'activo' (paga al día), 'prueba' (todavía no cobrás,
-- por ejemplo mientras conseguís el primer edificio piloto), 'moroso'
-- (dejó de pagar — bloquea el acceso de vecinos, admin y proveedores).

-- Actualizamos las funciones de login para que devuelvan también el estado
-- de pago (así el cliente puede bloquear el acceso si corresponde)

CREATE OR REPLACE FUNCTION fh_buscar_edificio(p_codigo TEXT)
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT, estado_pago TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id, e.nombre, e.direccion, e.estado_pago FROM edificios e
  WHERE e.codigo_acceso = p_codigo LIMIT 1
$$;

CREATE OR REPLACE FUNCTION fh_verificar_pin(p_edificio_id UUID, p_pin TEXT)
RETURNS TABLE(id UUID, nombre TEXT, direccion TEXT, estado_pago TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_pin_real TEXT;
BEGIN
  SELECT pin_admin INTO v_pin_real FROM edificios WHERE edificios.id = p_edificio_id;
  IF v_pin_real IS NULL OR v_pin_real != p_pin THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT e.id, e.nombre, e.direccion, e.estado_pago FROM edificios e
    WHERE e.pin_admin = p_pin ORDER BY e.nombre;
END;
$$;

-- ============================================================================
-- FIN. Para marcar un edificio como moroso o activo desde el panel INFRA,
-- ya no hace falta tocar SQL a mano: queda un botón en el panel de
-- Edificios de INFRA para cambiarlo con un toque (ver v31 del código).
-- ============================================================================
