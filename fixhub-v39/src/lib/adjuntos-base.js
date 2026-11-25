// Reglas de adjuntos SIN dependencias (sin Supabase): las usan la app y la página aislada /t del proveedor.
export const BUCKET_ADJUNTOS = 'adjuntos'
export const MAX_MB = 30
export const MAX_VIDEO_SEG = 60
export const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']

// Devuelve '' si está bien, o un mensaje de error (no mira la duración de los videos)
export function validarArchivoBase(file, { permitirVideo = true, permitirPdf = false } = {}) {
  if (!file) return 'No se eligió ningún archivo.'
  const tipo = file.type || ''
  if (!MIMES_OK.includes(tipo)) return 'Ese tipo de archivo no está permitido. Usá foto, video corto' + (permitirPdf ? ' o PDF.' : '.')
  if (tipo.startsWith('video/') && !permitirVideo) return 'Acá solo se pueden subir fotos.'
  if (tipo === 'application/pdf' && !permitirPdf) return 'Acá no se pueden subir PDF.'
  if (file.size > MAX_MB * 1024 * 1024) return `El archivo pesa más de ${MAX_MB} MB. Probá con uno más corto o más liviano.`
  return ''
}
