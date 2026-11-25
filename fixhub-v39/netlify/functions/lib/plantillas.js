// Textos de las plantillas de WhatsApp (fuente única: plantillas.json, ahora inline; ver README.md)
// y armado de sus variables. Los textos salen SOLO de los datos del reporte del vecino y nunca llevan datos personales.
const { plantillas, footer } = {"footer":"Respondé BAJA para no recibir más avisos","plantillas":{"trabajo_nuevo":{"texto":"Hola {{1}}, tenés un trabajo nuevo de {{2}} en {{3}}, depto {{4}}. Urgencia: {{5}}. Problema: {{6}}. Tocá el botón para aceptarlo, pedir presupuesto o avisar si no podés.","variables":6,"boton":"Ver trabajo","env":"TWILIO_CONTENT_SID_TRABAJO_NUEVO"},"mensaje_nuevo":{"texto":"Hola {{1}}, {{2}} te escribió por el trabajo '{{3}}': {{4}}. Tocá el botón para responder.","variables":4,"boton":"Responder","env":"TWILIO_CONTENT_SID_MENSAJE_NUEVO"},"acuerdo_novedad":{"texto":"Hola {{1}}, hay novedades en el acuerdo del trabajo '{{2}}': {{3}}. Entrá para verlo.","variables":3,"boton":"Ver acuerdo","env":"TWILIO_CONTENT_SID_ACUERDO_NOVEDAD"},"recordatorio_trabajo":{"texto":"Hola {{1}}, el trabajo '{{2}}' sigue esperando tu respuesta. Tocá el botón para verlo.","variables":2,"boton":"Ver trabajo","env":"TWILIO_CONTENT_SID_RECORDATORIO"},"recordatorio_finalizar":{"texto":"Hola {{1}}, el trabajo '{{2}}' sigue abierto. Si ya lo terminaste, tocá el botón para marcarlo como finalizado.","variables":2,"boton":"Ver trabajo","env":"TWILIO_CONTENT_SID_RECORDATORIO_FINALIZAR"}}}
const { quitarContacto, contieneContacto } = require('./common')

const FOOTER = footer

// WhatsApp no admite saltos de línea, tabuladores ni 4 espacios seguidos dentro de una variable, y no puede quedar vacía
function limpiarVar(v, max = 200) {
  let t = String(v ?? '').replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  if (t.length > max) t = t.slice(0, max - 1).trimEnd() + '…'
  return t || '-'
}

const primerNombre = (n) => limpiarVar(String(n || '').trim().split(/\s+/)[0] || 'Hola', 40)

// Saca las frases que traen un teléfono, email o link (si no queda nada, al menos borra el dato)
function sinContacto(txt) {
  const t = String(txt ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  if (!contieneContacto(t)) return t
  const limpio = t.split(/(?<=[.!?])\s+/).filter(f => !contieneContacto(f)).join(' ').trim()
  return limpio || quitarContacto(t)
}

// Texto del reporte sin teléfonos, emails ni links, y de ~100 caracteres
function resumen(desc, max = 100) {
  const t = sinContacto(desc)
  if (!t) return ''
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

const URGENCIA = { alta: 'Alta', media: 'Media', baja: 'Baja' }

function varsTrabajoNuevo({ proveedorNombre, categoria, edificioNombre, depto, urgencia, titulo, descripcion, nota }) {
  const res = resumen(descripcion)
  const t = sinContacto(titulo)
  let problema = res && res.toLowerCase() !== t.toLowerCase() ? `${t}: ${res}` : t
  const n = sinContacto(nota)
  if (n) problema += ` | Nota del administrador: ${n}`
  return [
    primerNombre(proveedorNombre), limpiarVar(categoria, 40), limpiarVar(edificioNombre, 60),
    limpiarVar(depto || '?', 20), URGENCIA[urgencia] || 'Media', limpiarVar(problema, 320),
  ]
}

function varsMensajeNuevo({ proveedorNombre, quien, titulo, detalle }) {
  return [primerNombre(proveedorNombre), limpiarVar(quien, 60), limpiarVar(sinContacto(titulo), 80), limpiarVar(detalle, 140)]
}

function varsAcuerdoNovedad({ proveedorNombre, titulo, novedad }) {
  return [primerNombre(proveedorNombre), limpiarVar(sinContacto(titulo), 80), limpiarVar(novedad, 160)]
}

function varsRecordatorio({ proveedorNombre, titulo }) {
  return [primerNombre(proveedorNombre), limpiarVar(sinContacto(titulo), 80)]
}

// Texto final con las variables puestas (sandbox sin plantillas y vista previa para el admin)
function renderTexto(nombre, variables) {
  const p = plantillas[nombre]
  if (!p) return ''
  return p.texto.replace(/\{\{(\d+)\}\}/g, (_, i) => String(variables[Number(i) - 1] ?? '-'))
}

module.exports = { plantillas, FOOTER, limpiarVar, primerNombre, sinContacto, resumen, varsTrabajoNuevo, varsMensajeNuevo, varsAcuerdoNovedad, varsRecordatorio, renderTexto }
