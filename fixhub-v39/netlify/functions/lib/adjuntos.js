// Adjuntos en el servidor: tipos y tamaños permitidos (mismos que src/lib/adjuntos-base.js) y chequeo de rutas.
const BUCKET = 'adjuntos'
const MAX_MB = 30
const MIMES_PROVEEDOR = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']   // por link: fotos y comprobantes (sin video)
const MAX_SUBIDAS_POR_LINK = 40

const limpiarNombre = (n) => String(n || 'archivo').replace(/[^a-zA-Z0-9.]/g, '_').slice(-60) || 'archivo'
const prefijoDe = (aviso) => `${aviso.edificio_id}/${aviso.id}/`

// Los paths que vienen de la base los puede haber escrito un vecino: solo firmamos los de ESTE reclamo
function rutaPermitida(path, aviso) {
  const p = String(path || '').replace(/^adjuntos:/, '')
  return p.startsWith(prefijoDe(aviso)) && !p.includes('..') && p.length < 300 ? p : null
}

// Valida la lista que manda el proveedor al finalizar. Devuelve { error } o { lista }
function validarAdjuntosProveedor(lista, aviso) {
  if (lista == null) return { lista: [] }
  if (!Array.isArray(lista) || lista.length > 10) return { error: 'Máximo 10 archivos.' }
  const out = []
  for (const it of lista) {
    const path = rutaPermitida(it?.path, aviso)
    if (!path) return { error: 'Archivo inválido.' }
    if (!MIMES_PROVEEDOR.includes(String(it?.tipo || ''))) return { error: 'Tipo de archivo no permitido.' }
    out.push({ path, tipo: it.tipo, nombre: String(it?.nombre || '').slice(0, 80), size: Math.max(0, Math.min(Number(it?.size) || 0, MAX_MB * 1048576)) })
  }
  return { lista: out }
}

// URLs firmadas de descarga (10 min). Devuelve { path: url }
async function firmar(admin, paths, segundos = 600) {
  const unicos = [...new Set(paths.filter(Boolean))].slice(0, 60)
  if (!unicos.length) return {}
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(unicos, segundos)
  const out = {}
  for (const r of data || []) if (r?.signedUrl && r.path) out[r.path] = r.signedUrl
  return out
}

module.exports = { BUCKET, MAX_MB, MIMES_PROVEEDOR, MAX_SUBIDAS_POR_LINK, limpiarNombre, prefijoDe, rutaPermitida, validarAdjuntosProveedor, firmar }
