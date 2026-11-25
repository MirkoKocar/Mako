// Acuerdo de visita / monto / alcance. Una parte propone, la otra acepta y el administrador aprueba o rechaza.
// Sin la aprobación del administrador no vale. Lo usan trabajo-link.js (proveedor), trabajo-app.js (vecino/admin) y el cron.
const { contieneContacto, MENSAJE_BLOQUEO } = require('./common')
const { avisar, avisarAdmins } = require('./common')
const { marcarNovedad } = require('./proveedor-wa')
const { primerNombre } = require('./plantillas')

const COLS = 'id, propuesto_por, fecha_visita, franja, monto_presupuesto, alcance, estado, aceptado_at, decidido_at, decidido_motivo, vence_at, created_at'
const FRANJAS = ['manana', 'tarde', 'noche', 'a_coordinar']
const FASES_ACUERDO = ['derivado', 'en_camino']
const EN_CURSO = ['propuesto', 'aceptado_contraparte']

const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)   // Argentina = UTC-3

async function vencerViejos(admin, avisoId) {
  await admin.from('acuerdos').update({ estado: 'vencido', updated_at: new Date().toISOString() })
    .eq('aviso_id', avisoId).in('estado', EN_CURSO).lt('vence_at', new Date().toISOString())
}

// { vigente, rechazado }: vigente = el último que no está vencido ni rechazado; rechazado = el último, si fue rechazado y no hay otro después
async function acuerdoVigente(admin, avisoId) {
  await vencerViejos(admin, avisoId)
  const { data } = await admin.from('acuerdos').select(COLS).eq('aviso_id', avisoId).order('created_at', { ascending: false }).limit(10)
  const lista = data || []
  const vigente = lista.find(a => a.estado !== 'vencido' && a.estado !== 'rechazado') || null
  const rechazado = !vigente && lista[0]?.estado === 'rechazado' ? lista[0] : null
  return { vigente, rechazado }
}

function validarPropuesta(b, { montoObligatorio = false } = {}) {
  const alcance = String(b?.alcance ?? '').replace(/\s+/g, ' ').trim()
  if (alcance.length < 3) return { error: 'Escribí qué incluye el trabajo (mínimo 3 letras).' }
  if (alcance.length > 300) return { error: 'El alcance puede tener hasta 300 caracteres.' }
  if (contieneContacto(alcance)) return { error: MENSAJE_BLOQUEO }
  let fecha = null
  if (b?.fecha_visita) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha_visita))) return { error: 'Fecha inválida.' }
    fecha = String(b.fecha_visita)
    const max = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
    if (fecha < hoyAR()) return { error: 'La fecha de visita no puede ser pasada.' }
    if (fecha > max) return { error: 'La fecha de visita es demasiado lejana (máximo 90 días).' }
    if (isNaN(new Date(fecha + 'T12:00:00Z').getTime())) return { error: 'Fecha inválida.' }
  }
  let franja = b?.franja ? String(b.franja) : null
  if (franja && !FRANJAS.includes(franja)) return { error: 'Franja inválida.' }
  if (fecha && !franja) franja = 'a_coordinar'
  let monto = null
  if (b?.monto !== undefined && b?.monto !== null && b?.monto !== '') {
    monto = Number(b.monto)
    if (!isFinite(monto) || monto <= 0 || monto >= 1e9) return { error: 'Ingresá un monto válido.' }
    monto = Math.round(monto * 100) / 100
  } else if (montoObligatorio) return { error: 'Ingresá el monto del presupuesto.' }
  return { valor: { alcance, fecha_visita: fecha, franja, monto_presupuesto: monto } }
}

const rotuloFranja = { manana: 'por la mañana', tarde: 'por la tarde', noche: 'por la noche', a_coordinar: 'a coordinar' }
const fmtFecha = (f) => { const [y, m, d] = String(f).split('-'); return `${d}/${m}/${y}` }

function resumenCorto(a) {
  const partes = []
  if (a.fecha_visita) partes.push(`visita el ${fmtFecha(a.fecha_visita)} ${rotuloFranja[a.franja] || ''}`.trim())
  if (a.monto_presupuesto != null) partes.push(`$${Number(a.monto_presupuesto).toLocaleString('es-AR')}`)
  return partes.join(', ')
}

async function proponer(admin, aviso, rol, body, opts = {}) {
  if (!['vecino', 'proveedor'].includes(rol)) return { status: 403, error: 'Solo el vecino o el proveedor pueden proponer un acuerdo.' }
  if (!FASES_ACUERDO.includes(aviso.fase)) return { status: 409, error: 'Ya no se puede proponer un acuerdo en este momento.' }
  const v = validarPropuesta(body, opts)
  if (v.error) return { status: 400, error: v.error }
  await vencerViejos(admin, aviso.id)
  // la propuesta nueva reemplaza a la que estaba en curso (todavía sin aprobar)
  await admin.from('acuerdos').update({ estado: 'vencido', updated_at: new Date().toISOString() }).eq('aviso_id', aviso.id).in('estado', EN_CURSO)
  const { data, error } = await admin.from('acuerdos').insert({ aviso_id: aviso.id, propuesto_por: rol, ...v.valor }).select(COLS).single()
  if (error) return { status: 409, error: 'No se pudo guardar el acuerdo. Probá de nuevo.' }
  return { acuerdo: data }
}

async function aceptar(admin, aviso, rol, acuerdoId) {
  if (!FASES_ACUERDO.includes(aviso.fase)) return { status: 409, error: 'Ya no se puede aceptar un acuerdo en este momento.' }
  await vencerViejos(admin, aviso.id)
  const { data: r } = await admin.from('acuerdos').select(COLS).eq('id', String(acuerdoId || '')).eq('aviso_id', aviso.id).limit(1)
  const a = r?.[0]
  if (!a || a.estado !== 'propuesto') return { status: 409, error: 'Este acuerdo ya no está esperando tu respuesta.' }
  if (a.propuesto_por === rol) return { status: 403, error: 'Tiene que aceptarlo la otra parte.' }
  const { data, error } = await admin.from('acuerdos').update({ estado: 'aceptado_contraparte', aceptado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', a.id).eq('estado', 'propuesto').select(COLS).single()
  if (error || !data) return { status: 409, error: 'Este acuerdo ya cambió. Actualizá la pantalla.' }
  return { acuerdo: data }
}

async function decidir(admin, aviso, acuerdoId, aprobar, motivo) {
  await vencerViejos(admin, aviso.id)
  const { data: r } = await admin.from('acuerdos').select(COLS).eq('id', String(acuerdoId || '')).eq('aviso_id', aviso.id).limit(1)
  const a = r?.[0]
  if (!a || !EN_CURSO.includes(a.estado)) return { status: 409, error: 'Este acuerdo ya no está pendiente.' }
  if (aprobar && a.estado !== 'aceptado_contraparte') return { status: 409, error: 'Todavía falta que la otra parte lo acepte.' }
  const txt = String(motivo || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const ahora = new Date().toISOString()
  const { data, error } = await admin.from('acuerdos').update({ estado: aprobar ? 'aprobado_admin' : 'rechazado', decidido_at: ahora, decidido_motivo: txt || null, updated_at: ahora })
    .eq('id', a.id).in('estado', EN_CURSO).select(COLS).single()
  if (error || !data) return { status: 409, error: 'Este acuerdo ya cambió. Actualizá la pantalla.' }
  if (aprobar) await admin.from('acuerdos').update({ estado: 'vencido', updated_at: ahora }).eq('aviso_id', aviso.id).eq('estado', 'aprobado_admin').neq('id', a.id)
  return { acuerdo: data }
}

// Avisos de cada novedad. "aviso" necesita: id, edificio_id, vecino_id, proveedor_id, titulo, proveedor_nombre
//  evento: 'propuesto' | 'aceptado' | 'aprobado' | 'rechazado'   ·  por: 'vecino' | 'proveedor' | 'admin'
async function notificarAcuerdo(admin, aviso, { evento, por, acuerdo, vecinoNombre }) {
  const data = { tipo: 'acuerdo', aviso_id: aviso.id }
  const resumen = resumenCorto(acuerdo)
  const aVecino = (t, b) => avisar(admin, { user_id: aviso.vecino_id, rol: 'vecino' }, t, b, data).catch(() => {})
  const aAdmins = (t, b) => avisarAdmins(admin, aviso.edificio_id, t, b, data).catch(() => {})
  // al proveedor: push si usa la app; si no, WhatsApp con el mismo link (agrupado)
  const aProveedor = async (t, b, texto) => {
    if (!aviso.proveedor_id) return
    await avisar(admin, { user_id: aviso.proveedor_id, rol: 'proveedor' }, t, b, data).catch(() => {})
    await marcarNovedad(admin, aviso.id, { tipo: 'acuerdo', texto }).catch(() => {})
  }
  const nombreVecino = primerNombre(vecinoNombre || 'El vecino')
  if (evento === 'propuesto') {
    if (por === 'proveedor') await aVecino('🤝 Propuesta de acuerdo', `${aviso.proveedor_nombre || 'El proveedor'} propuso un acuerdo para "${aviso.titulo}". Revisalo en el chat.`)
    else await aProveedor('🤝 Propuesta de acuerdo', `${nombreVecino} propuso un acuerdo para "${aviso.titulo}".`, `${nombreVecino} propuso un acuerdo${resumen ? ': ' + resumen : ''}`)
    await aAdmins('🤝 Nueva propuesta de acuerdo', `${aviso.titulo}${resumen ? ' · ' + resumen : ''}`)
  } else if (evento === 'aceptado') {
    await aAdmins('🤝 Acuerdo listo para aprobar', `${aviso.titulo}${resumen ? ' · ' + resumen : ''}. Falta tu aprobación.`)
    if (acuerdo.propuesto_por === 'vecino') await aProveedor('🤝 Acuerdo aceptado', `Aceptaron tu acuerdo en "${aviso.titulo}". Falta la aprobación del administrador.`, 'Aceptaron el acuerdo. Falta la aprobación del administrador')
    else await aVecino('🤝 Acuerdo aceptado', `Aceptaron el acuerdo de "${aviso.titulo}". Falta la aprobación del administrador.`)
  } else if (evento === 'aprobado') {
    await aVecino('✅ Acuerdo aprobado', `El administrador aprobó el acuerdo de "${aviso.titulo}".`)
    await aProveedor('✅ Acuerdo aprobado', `El administrador aprobó el acuerdo de "${aviso.titulo}".`, 'El administrador aprobó el acuerdo')
  } else if (evento === 'rechazado') {
    await aVecino('❌ Acuerdo rechazado', `El administrador rechazó el acuerdo de "${aviso.titulo}". Pueden proponer otro.`)
    await aProveedor('❌ Acuerdo rechazado', `El administrador rechazó el acuerdo de "${aviso.titulo}".`, 'El administrador rechazó el acuerdo. Pueden proponer otro')
  }
}

module.exports = { COLS, FRANJAS, FASES_ACUERDO, vencerViejos, acuerdoVigente, validarPropuesta, proponer, aceptar, decidir, notificarAcuerdo, resumenCorto }
