import { supabase } from '../supabase'
import { BUCKET_ADJUNTOS, MAX_MB, MAX_VIDEO_SEG, validarArchivoBase } from './adjuntos-base'

export { BUCKET_ADJUNTOS, MAX_MB, MAX_VIDEO_SEG }

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
export async function validarArchivo(file, opciones = {}) {
  const err = validarArchivoBase(file, opciones)
  if (err) return err
  if ((file.type || '').startsWith('video/')) {
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
