import { supabase } from '../supabase'

// Avisa al servidor que pasó algo en un reclamo (él decide a quién notificar).
// Nunca bloquea la acción principal: si falla, la acción ya quedó hecha.
export async function notificar(body) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null
    const res = await fetch('/.netlify/functions/notificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
    return res.ok ? await res.json() : null
  } catch (e) { console.warn('notificar:', e); return null }
}

// Envuelve un RPC: devuelve { data } o { error: mensaje legible }
export async function rpc(nombre, params) {
  try {
    const { data, error } = await supabase.rpc(nombre, params)
    if (error) return { error: error.message?.replace(/^.*?:\s*/, '') || 'No se pudo completar la acción.' }
    return { data }
  } catch (e) { return { error: 'No se pudo conectar. Revisá tu conexión.' } }
}

export const FASES = {
  pendiente_admin:      { label: 'Esperando al administrador', color: '#fbbf24', paso: 0 },
  info_solicitada:      { label: 'Falta información',          color: '#fb923c', paso: 0 },
  rechazado:            { label: 'Rechazado',                  color: '#f87171', paso: -1 },
  derivado:             { label: 'Esperando al proveedor',     color: '#60a5fa', paso: 1 },
  en_camino:            { label: 'Proveedor en camino',        color: '#60a5fa', paso: 2 },
  finalizado_proveedor: { label: 'Finalizado — falta confirmar', color: '#34d399', paso: 3 },
  cerrado:              { label: 'Cerrado',                    color: '#34d399', paso: 4 },
}
export const PASOS = ['Reportado', 'Autorizado', 'En camino', 'Finalizado', 'Cerrado']

export async function enlaceWhatsApp(telefono, link, aviso) {
  const texto = `Hola! Tenés un trabajo nuevo en FixHub (${aviso.categoria}: ${aviso.titulo}). Entrá desde este link, sin usuario ni contraseña: ${link}`
  const tel = String(telefono || '').replace(/\D/g, '')
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
}
