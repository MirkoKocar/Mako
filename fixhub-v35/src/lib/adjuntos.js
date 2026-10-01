import { supabase } from '../supabase'

export const BUCKET_ADJUNTOS = 'adjuntos'
export const MAX_MB = 30
export const MAX_VIDEO_SEG = 60
const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']

function duracionVideo(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    const url = URL.createObjectURL(file)
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration) }
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    v.src = url
  })
}

// Devuelve '' si está bien, o un mensaje de error
export async function validarArchivo(file, { permitirVideo = true, permitirPdf = false } = {}) {
  if (!file) return 'No se eligió ningún archivo.'
  const tipo = file.type || ''
  const esVideo = tipo.startsWith('video/')
  const esPdf = tipo === 'application/pdf'
  if (!MIMES_OK.includes(tipo)) return 'Ese tipo de archivo no está permitido. Usá foto, video corto' + (permitirPdf ? ' o PDF.' : '.')
  if (esVideo && !permitirVideo) return 'Acá solo se pueden subir fotos.'
  if (esPdf && !permitirPdf) return 'Acá no se pueden subir PDF.'
  if (file.size > MAX_MB * 1024 * 1024) return `El archivo pesa más de ${MAX_MB} MB. Probá con uno más corto o más liviano.`
  if (esVideo) {
    const d = await duracionVideo(file)
    if (d && d > MAX_VIDEO_SEG + 1) return `El video dura más de ${MAX_VIDEO_SEG} segundos. Grabá uno más corto.`
  }
  return ''
}

const limpiar = (n) => n.replace(/[^a-zA-Z0-9.]/g, '_').slice(-60)

// Sube un archivo al bucket PRIVADO. La ruta es <edificio>/<aviso>/<archivo>
export async function subirAdjunto(file, edificioId, avisoId) {
  const path = `${edificioId}/${avisoId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${limpiar(file.name || 'archivo')}`
  const { error } = await supabase.storage.from(BUCKET_ADJUNTOS).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return { path, tipo: file.type, nombre: (file.name || '').slice(0, 80), size: file.size }
}

const cache = new Map()
// URL firmada temporal (1 hora): el archivo nunca es público
export async function urlFirmada(path) {
  if (!path) return null
  if (path.startsWith('http')) return path             // fotos viejas del chat (bucket público anterior)
  const c = cache.get(path)
  if (c && c.exp > Date.now()) return c.url
  const { data, error } = await supabase.storage.from(BUCKET_ADJUNTOS).createSignedUrl(path.replace(/^adjuntos:/, ''), 3600)
  if (error || !data?.signedUrl) return null
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}
