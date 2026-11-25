// Links seguros del proveedor (/t/<token>): crear, reutilizar, revocar y auditar.
//  - Vigencia: mientras el reporte esté en derivado / en_camino / finalizado_proveedor (se valida en CADA request).
//  - Tope de seguridad: 60 días desde que se creó.
const { baseUrl } = require('./common')
const { nuevoTokenLink, hashToken, cifrarToken, descifrarToken } = require('./common')

const DIAS_TOPE = 60
const FASES_ACTIVAS = ['derivado', 'en_camino', 'finalizado_proveedor']
const MENSAJE_INACTIVO = 'Este link ya no está activo. Pedile uno nuevo al administrador.'
const urlDe = (token) => `${baseUrl()}/t/${token}`

async function registrarEvento(admin, enlaceId, evento, { ipHash = null, userAgent = null } = {}) {
  try {
    await admin.from('enlace_eventos').insert({ enlace_id: enlaceId, evento: String(evento).slice(0, 60), ip_hash: ipHash, user_agent: userAgent ? String(userAgent).slice(0, 200) : null })
  } catch { /* la auditoría nunca debe frenar la acción */ }
}

async function revocarEnlaces(admin, avisoId, motivo) {
  await admin.from('enlaces_proveedor').update({ revocado: true, revocado_at: new Date().toISOString(), revocado_motivo: String(motivo).slice(0, 60) })
    .eq('aviso_id', avisoId).eq('revocado', false)
}

// Link NUEVO (el anterior de este trabajo deja de funcionar)
async function crearEnlace(admin, aviso) {
  await revocarEnlaces(admin, aviso.id, 'reemplazado')
  const token = nuevoTokenLink(), hash = hashToken(token)
  const cifrado = cifrarToken(token, hash)
  if (!cifrado) console.error('LINK_ENC_KEY faltante o inválida: el link funciona, pero no se va a poder reenviar el MISMO link')
  const { data, error } = await admin.from('enlaces_proveedor').insert({
    aviso_id: aviso.id, proveedor_id: aviso.proveedor_id, token_hash: hash, token_cifrado: cifrado,
    expires_at: new Date(Date.now() + DIAS_TOPE * 86400000).toISOString(),
  }).select('id').single()
  if (error) throw error
  await admin.from('avisos').update({ enlace_enviado_at: new Date().toISOString() }).eq('id', aviso.id)
  await registrarEvento(admin, data.id, 'creado')
  return { token, url: urlDe(token), enlaceId: data.id, reutilizado: false }
}

async function enlaceActivo(admin, avisoId, proveedorId) {
  const { data } = await admin.from('enlaces_proveedor')
    .select('id, token_hash, token_cifrado, expires_at, aceptado_at, primer_acceso_at, ultimo_acceso_at, created_at')
    .eq('aviso_id', avisoId).eq('proveedor_id', proveedorId).eq('revocado', false)
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1)
  return data?.[0] || null
}

// El MISMO link de siempre si se puede recuperar; si no (link viejo sin cifrar, o sin clave), uno nuevo
async function obtenerOCrearEnlace(admin, aviso) {
  const e = await enlaceActivo(admin, aviso.id, aviso.proveedor_id)
  const token = e ? descifrarToken(e.token_cifrado, e.token_hash) : null
  if (e && token) return { token, url: urlDe(token), enlaceId: e.id, reutilizado: true }
  return crearEnlace(admin, aviso)
}

module.exports = { DIAS_TOPE, FASES_ACTIVAS, MENSAJE_INACTIVO, urlDe, registrarEvento, revocarEnlaces, crearEnlace, enlaceActivo, obtenerOCrearEnlace }
