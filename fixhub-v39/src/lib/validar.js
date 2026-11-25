// Validaciones compartidas (el servidor vuelve a validar todo: esto es solo
// para darle feedback rápido a la persona).
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const emailValido = (e) => EMAIL_REGEX.test(String(e).trim()) && String(e).length <= 120

// Contraseña: mínimo 8, con al menos una letra y un número
export function validarClave(p) {
  if (!p || p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (p.length > 72) return 'La contraseña es demasiado larga (máximo 72).'
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'La contraseña debe tener al menos una letra y un número.'
  return ''
}

// Nombres de persona: letras (con tildes), espacios, apóstrofe y guion
export function validarNombre(n) {
  const v = String(n || '').trim().replace(/\s+/g, ' ')
  if (v.length < 2) return 'Ingresá tu nombre.'
  if (v.length > 60) return 'El nombre es demasiado largo.'
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]*$/.test(v)) return 'El nombre solo puede tener letras y espacios.'
  return ''
}

// Teléfono (opcional): formato internacional, 10 a 15 dígitos
export function validarTelefono(t, { obligatorio = false } = {}) {
  const d = String(t || '').replace(/\D/g, '')
  if (!d) return obligatorio ? 'Ingresá un teléfono.' : ''
  if (d.length < 10 || d.length > 15) return 'El teléfono no parece válido (10 a 15 dígitos, con código de área).'
  if (d.startsWith('54') && d.length !== 13) return 'Para Argentina con código de país son 13 dígitos (ej: 5491122334455).'
  return ''
}

// Celular argentino -> "549" + área + número (E.164 sin el "+"). Misma lógica que netlify/functions/lib/telefono.js.
// Acepta "11 2233-4455", "011 15 2233 4455", "+54 9 11 2233 4455", "(0221) 15-555-1234", etc. Devuelve null si no se entiende.
export function normalizarTelefonoAR(entrada) {
  let d = String(entrada ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) { d = d.slice(2); if (d.startsWith('9')) d = d.slice(1) }
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length === 12) {
    for (const largo of [2, 3, 4]) {
      if (d.slice(largo, largo + 2) === '15') {
        const sin = d.slice(0, largo) + d.slice(largo + 2)
        if (sin.length === 10) { d = sin; break }
      }
    }
  }
  if (d.length !== 10 || !/^[1-3]/.test(d)) return null
  return '549' + d
}

// Para cargar proveedores (WhatsApp): tiene que ser un celular argentino
export function validarCelularAR(t) {
  if (!String(t || '').replace(/\D/g, '')) return 'Ingresá el celular del proveedor.'
  if (!normalizarTelefonoAR(t)) return 'No parece un celular argentino. Probá con código de área y número, ej: 11 2233-4455.'
  return ''
}

export const formatoTelefonoAR = (t) => { const n = normalizarTelefonoAR(t); return n ? `+54 9 ${n.slice(3, -8)} ${n.slice(-8, -4)}-${n.slice(-4)}` : String(t || '') }

export const soloDigitos = (t) => String(t || '').replace(/\D/g, '')

export function validarMonto(v) {
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'))
  if (!n || n <= 0) return { error: 'Ingresá un monto mayor a cero.' }
  if (n >= 1e9) return { error: 'El monto es demasiado alto.' }
  return { valor: Math.round(n * 100) / 100 }
}

export const fmtPesos = (n) => n == null ? '—' : '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })
export const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fmtFechaHora = (d) => d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export const TERMINOS_VERSION = '2026-09'
