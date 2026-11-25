
// WhatsApp al proveedor: reglas de envío (consentimiento, baja), registro, agrupado y recordatorios.
const { normalizarTelefonoAR } = require('./telefono')
// whatsapp.js se carga recién al enviar: si ese archivo estuviera dañado en el deploy, solo falla el ENVÍO (y se le avisa al admin),
// pero el resto de la app (vista previa, chat, acuerdos, panel) sigue andando.
async function enviarPlantilla(args) {
  try { return await require('./whatsapp').enviarPlantilla(args) }
  catch (e) {
    console.error('No se pudo cargar lib/whatsapp.js:', String(e?.message || e).split('\n')[0])
    return { ok: false, canal: 'twilio', error: 'No se pudo cargar el módulo de WhatsApp (revisá netlify/functions/lib/whatsapp.js)' }
  }
}
const P = require('./plantillas')
const { crearEnlace, obtenerOCrearEnlace, enlaceActivo } = require('./enlaces')
const { descifrarToken } = require('./tokens')
const { avisarAdmins } = require('./push')
 
const INACTIVO_SEG = 60          // sin actividad en la página de más de 60 s = "no la tiene abierta"
const AGRUPAR_MIN = 10           // máximo un WhatsApp de novedades cada 10 min por trabajo
 
const MOTIVOS = {
  sin_telefono: 'el proveedor no tiene teléfono cargado',
  telefono_invalido: 'el teléfono del proveedor no es un celular argentino válido',
  sin_consentimiento: 'falta confirmar que el proveedor aceptó recibir avisos por WhatsApp',
  baja: 'el proveedor respondió BAJA y pidió no recibir más avisos',
}
 
function puedeRecibirWa(prov) {
  if (!prov?.telefono) return { ok: false, motivo: 'sin_telefono' }
  if (!normalizarTelefonoAR(prov.telefono)) return { ok: false, motivo: 'telefono_invalido' }
  if (!prov.whatsapp_optin_at) return { ok: false, motivo: 'sin_consentimiento' }
  if (prov.whatsapp_optout_at) return { ok: false, motivo: 'baja' }
  return { ok: true }
}
 
const COLS_AVISO = 'id, edificio_id, vecino_id, proveedor_id, proveedor_nombre, titulo, descripcion, categoria, urgencia, fase, autorizado_por, nota_proveedor, chat_pausado, derivado_at, aceptado_at'
 
// Todo lo necesario para armar los textos (consultas acotadas, sin select('*'))
async function contexto(admin, avisoId) {
  const { data: a } = await admin.from('avisos').select(COLS_AVISO).eq('id', avisoId).limit(1)
  const aviso = a?.[0]
  if (!aviso) return null
  const [{ data: e }, { data: v }, { data: p }] = await Promise.all([
    admin.from('edificios').select('id, nombre, direccion, requiere_acuerdo').eq('id', aviso.edificio_id).limit(1),
    admin.from('vecinos').select('nombre, departamento').eq('id', aviso.vecino_id).limit(1),
    aviso.proveedor_id ? admin.from('proveedores').select('id, nombre, telefono, whatsapp_optin_at, whatsapp_optout_at, eliminado_at').eq('id', aviso.proveedor_id).limit(1) : Promise.resolve({ data: [] }),
  ])
  return { aviso, edificio: e?.[0] || {}, vecino: v?.[0] || {}, prov: p?.[0] || null }
}
 
async function enviarAProveedor(admin, ctx, { plantilla, variables, token, enlaceId }) {
  const chk = puedeRecibirWa(ctx.prov)
  if (!chk.ok) return { sent: false, motivo: chk.motivo }
  const r = await enviarPlantilla({ numero: ctx.prov.telefono, plantilla, variables, sufijoBoton: token })
  try {
    await admin.from('notificaciones_whatsapp').insert({
      aviso_id: ctx.aviso.id, enlace_id: enlaceId || null, proveedor_id: ctx.prov.id, plantilla,
      estado: r.ok ? 'enviado' : 'fallido', sid: r.sid || null, canal: r.canal || 'twilio', error: r.ok ? null : (r.error || 'error').slice(0, 300),
    })
  } catch (e) { console.error('No se pudo registrar el envío de WhatsApp') }
  if (!r.ok) {
    await avisarAdmins(admin, ctx.aviso.edificio_id, '⚠️ No se pudo enviar el WhatsApp',
      `${ctx.prov.nombre}: ${ctx.aviso.titulo}. Enviale el link vos desde el reclamo.`, { tipo: 'wa_fallo', aviso_id: ctx.aviso.id }).catch(() => {})
  }
  return { sent: r.ok, error: r.ok ? null : r.error }
}
 
// ---- Trabajo nuevo (o reenvío del mismo link) ----
async function enviarTrabajoNuevo(admin, avisoId, { reenviar = false, nota = null } = {}) {
  let ctx = await contexto(admin, avisoId)
  if (!ctx?.aviso.proveedor_id || !ctx.prov) throw new Error('El reclamo no tiene proveedor')
  if (!reenviar && nota !== null) {
    const limpia = P.sinContacto(nota).slice(0, 120)
    await admin.from('avisos').update({ nota_proveedor: limpia || null }).eq('id', avisoId)
    ctx.aviso.nota_proveedor = limpia || null
  }
  const enlace = reenviar ? await obtenerOCrearEnlace(admin, ctx.aviso) : await crearEnlace(admin, ctx.aviso)
  const variables = P.varsTrabajoNuevo({
    proveedorNombre: ctx.prov.nombre, categoria: ctx.aviso.categoria, edificioNombre: ctx.edificio.nombre,
    depto: ctx.vecino.departamento, urgencia: ctx.aviso.urgencia, titulo: ctx.aviso.titulo,
    descripcion: ctx.aviso.descripcion, nota: ctx.aviso.nota_proveedor,
  })
  const env = await enviarAProveedor(admin, ctx, { plantilla: 'trabajo_nuevo', variables, token: enlace.token, enlaceId: enlace.enlaceId })
  return { link: enlace.url, reutilizado: enlace.reutilizado, telefono: ctx.prov.telefono, proveedor: ctx.prov.nombre, whatsapp: env.sent, motivo: env.motivo || null, error: env.error || null }
}
 
// Vista previa para el admin antes de autorizar (no crea nada)
async function previewTrabajoNuevo(admin, avisoId, proveedorId, nota) {
  const ctx = await contexto(admin, avisoId)
  if (!ctx) return null
  const { data: p } = await admin.from('proveedores').select('id, nombre, telefono, whatsapp_optin_at, whatsapp_optout_at, edificio_id, eliminado_at').eq('id', proveedorId).limit(1)
  const prov = p?.[0]
  if (!prov || prov.edificio_id !== ctx.aviso.edificio_id || prov.eliminado_at) return null
  const variables = P.varsTrabajoNuevo({
    proveedorNombre: prov.nombre, categoria: ctx.aviso.categoria, edificioNombre: ctx.edificio.nombre,
    depto: ctx.vecino.departamento, urgencia: ctx.aviso.urgencia, titulo: ctx.aviso.titulo,
    descripcion: ctx.aviso.descripcion, nota: String(nota || '').slice(0, 120),
  })
  const chk = puedeRecibirWa(prov)
  return { texto: P.renderTexto('trabajo_nuevo', variables), footer: P.FOOTER, boton: P.plantillas.trabajo_nuevo.boton,
    puede_enviar: chk.ok, motivo: chk.ok ? null : MOTIVOS[chk.motivo] }
}
 
// ---- Novedades (mensajes del hilo / acuerdo) con agrupado ----
// Se llama cuando el vecino o el admin escriben (o cambia el acuerdo). Si el proveedor tiene la página abierta no hace falta nada:
// la ve por el polling. Si no, se marca como pendiente y se intenta enviar (máx. 1 WhatsApp cada 10 min por trabajo).
async function marcarNovedad(admin, avisoId, { tipo, texto = null } = {}) {
  const { data: a } = await admin.from('avisos').select('id, proveedor_id').eq('id', avisoId).limit(1)
  const av = a?.[0]
  if (!av?.proveedor_id) return { enviado: false }
  const e = await enlaceActivo(admin, av.id, av.proveedor_id)
  if (!e) return { enviado: false }
  const activo = e.ultimo_acceso_at && (Date.now() - new Date(e.ultimo_acceso_at).getTime()) < INACTIVO_SEG * 1000
  if (activo) return { enviado: false, motivo: 'pagina_abierta' }
  const upd = { wa_pendiente: true }
  if (tipo === 'acuerdo' && texto) upd.wa_acuerdo_pendiente = String(texto).slice(0, 160)
  await admin.from('enlaces_proveedor').update(upd).eq('id', e.id)
  return flushNovedades(admin, e.id)
}
 
async function flushNovedades(admin, enlaceId) {
  const { data: en } = await admin.from('enlaces_proveedor')
    .select('id, aviso_id, proveedor_id, token_hash, token_cifrado, revocado, expires_at, ultimo_acceso_at, wa_pendiente, wa_mensajes_hasta, wa_acuerdo_pendiente, created_at')
    .eq('id', enlaceId).limit(1)
  const e = en?.[0]
  if (!e || !e.wa_pendiente) return { enviado: false }
  const limpiar = (extra = {}) => admin.from('enlaces_proveedor').update({ wa_pendiente: false, wa_acuerdo_pendiente: null, ...extra }).eq('id', e.id)
  if (e.revocado || new Date(e.expires_at) < new Date()) { await limpiar(); return { enviado: false } }
  const ahora = new Date()
  if (e.ultimo_acceso_at && ahora - new Date(e.ultimo_acceso_at) < INACTIVO_SEG * 1000) { await limpiar({ wa_mensajes_hasta: ahora.toISOString() }); return { enviado: false, motivo: 'pagina_abierta' } }
 
  // máximo uno cada 10 min por trabajo: si hay uno reciente, queda pendiente y lo manda el cron
  const desdeThrottle = new Date(ahora - AGRUPAR_MIN * 60000).toISOString()
  const { data: rec } = await admin.from('notificaciones_whatsapp').select('id').eq('aviso_id', e.aviso_id)
    .in('plantilla', ['mensaje_nuevo', 'acuerdo_novedad']).gt('created_at', desdeThrottle).limit(1)
  if (rec?.length) return { enviado: false, motivo: 'agrupado' }
 
  const ctx = await contexto(admin, e.aviso_id)
  if (!ctx?.prov || ctx.aviso.proveedor_id !== e.proveedor_id) { await limpiar(); return { enviado: false } }
  const token = descifrarToken(e.token_cifrado, e.token_hash)
  if (!token) { await limpiar(); return { enviado: false, motivo: 'sin_token' } }   // link viejo sin cifrar: el admin puede reenviarlo
 
  const desde = new Date(e.wa_mensajes_hasta || e.created_at).toISOString()
  const { data: msgs } = await admin.from('mensajes').select('contenido, imagen_url, remitente_rol, created_at')
    .eq('aviso_id', e.aviso_id).in('remitente_rol', ['vecino', 'admin']).eq('es_nota_interna', false)
    .or('bloqueado.eq.false,liberado.eq.true').or(`created_at.gt.${desde},liberado_at.gt.${desde}`)
    .order('created_at', { ascending: true }).limit(50)
  const lista = msgs || []
  const hayAcuerdo = !!e.wa_acuerdo_pendiente
 
  let plantilla, variables
  if (lista.length) {
    const quienes = []
    if (lista.some(m => m.remitente_rol === 'vecino')) quienes.push(P.primerNombre(ctx.vecino.nombre))
    if (lista.some(m => m.remitente_rol === 'admin')) quienes.push('el administrador')
    let detalle = lista.length === 1
      ? (P.sinContacto(lista[0].contenido).slice(0, 100) || (lista[0].imagen_url ? 'te mandó una foto' : 'te mandó un mensaje'))
      : `tenés ${lista.length} mensajes nuevos`
    if (hayAcuerdo) detalle += '. Hay novedades en el acuerdo'
    plantilla = 'mensaje_nuevo'
    variables = P.varsMensajeNuevo({ proveedorNombre: ctx.prov.nombre, quien: quienes.join(' y ') || 'El vecino', titulo: ctx.aviso.titulo, detalle })
  } else if (hayAcuerdo) {
    plantilla = 'acuerdo_novedad'
    variables = P.varsAcuerdoNovedad({ proveedorNombre: ctx.prov.nombre, titulo: ctx.aviso.titulo, novedad: e.wa_acuerdo_pendiente })
  } else { await limpiar(); return { enviado: false } }
 
  const r = await enviarAProveedor(admin, ctx, { plantilla, variables, token, enlaceId: e.id })
  // Si falla no reintentamos en loop: el admin ya fue avisado y puede enviarlo a mano
  await limpiar({ wa_mensajes_hasta: ahora.toISOString() })
  return { enviado: r.sent, plantilla }
}
 
// ---- Recordatorios (los dispara el cron) ----
async function enviarRecordatorio(admin, avisoId, plantilla) {
  const ctx = await contexto(admin, avisoId)
  if (!ctx?.prov) return { sent: false }
  if (!P.plantillas[plantilla]) return { sent: false }
  const enlace = await obtenerOCrearEnlace(admin, ctx.aviso)
  const variables = P.varsRecordatorio({ proveedorNombre: ctx.prov.nombre, titulo: ctx.aviso.titulo })
  return enviarAProveedor(admin, ctx, { plantilla, variables, token: enlace.token, enlaceId: enlace.enlaceId })
}
 
module.exports = { INACTIVO_SEG, AGRUPAR_MIN, MOTIVOS, puedeRecibirWa, contexto, enviarAProveedor, enviarTrabajoNuevo, previewTrabajoNuevo, marcarNovedad, flushNovedades, enviarRecordatorio }
