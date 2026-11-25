// Avisos que dispara cada acción sobre un trabajo. Los usan notificar.js (app) y trabajo-link.js (link del proveedor)
// para que el admin y el vecino reciban EXACTAMENTE los mismos avisos, venga la acción de donde venga.
const { avisar, avisarAdmins, tokensDe } = require('./common')
const { enviarTrabajoNuevo } = require('./proveedor-wa')

const unidadDe = (edificioNombre, depto) => `${edificioNombre || 'Consorcio'} - Depto ${depto || '?'}`
const dataPush = (a) => ({ aviso_id: a.id })

// Asignación nueva (o reenvío): push al proveedor registrado (si tiene la app) + WhatsApp con el link
async function derivar(admin, a, unidad, { reenviar = false, nota = null } = {}) {
  const r = await enviarTrabajoNuevo(admin, a.id, { reenviar, nota })
  if (!reenviar) {
    await avisar(admin, { user_id: a.proveedor_id, rol: 'proveedor' }, '🔧 Nuevo trabajo asignado',
      `${unidad} · ${`${a.categoria}: ${a.titulo}`.slice(0, 120)}`, { tipo: 'trabajo', aviso_id: a.id }).catch(() => {})
  }
  return r
}

async function postAceptado(admin, a, unidad) {
  await avisarAdmins(admin, a.edificio_id, '🚗 Proveedor en camino', `${a.proveedor_nombre} aceptó: ${unidad} · ${a.titulo}`, { tipo: 'aceptado', ...dataPush(a) })
  await avisar(admin, { user_id: a.vecino_id, rol: 'vecino' }, '🚗 Tu proveedor va en camino', `${a.proveedor_nombre} aceptó tu reporte "${a.titulo}".`, { tipo: 'aceptado', ...dataPush(a) })
}

// "a" es el reclamo DESPUÉS de la acción. Cuando un proveedor dice "no puedo" la base SIEMPRE intenta pasarlo sola al
// siguiente del mismo edificio y rubro (supabase.sql, parte 6). Acá: se deriva al nuevo (link + WhatsApp) y se le avisa al admin.
async function postNoPuede(admin, a, unidad) {
  const anterior = a.reasignado_de_nombre || 'El proveedor'
  const motivo = a.motivo_no_puede ? ` Motivo: "${String(a.motivo_no_puede).slice(0, 90)}".` : ''
  if (a.fase === 'derivado' && a.proveedor_id) {
    const r = await derivar(admin, a, unidad)
    const sinWa = r && !r.whatsapp ? ` ⚠️ No se le pudo mandar el WhatsApp: pasale el link a mano desde el reclamo.` : ''
    await avisarAdmins(admin, a.edificio_id, '🔄 Reasignado automáticamente',
      `${unidad} · ${a.titulo}: ${anterior} no pudo.${motivo} La app lo pasó a ${a.proveedor_nombre}.${sinWa}`, { tipo: 'reasignado_auto', ...dataPush(a) })
  } else {
    await avisarAdmins(admin, a.edificio_id, '⚠️ Ningún proveedor pudo',
      `${unidad} · ${a.titulo}: ${anterior} no pudo.${motivo} No hay otro disponible de ${a.categoria}: elegí uno o cargá más proveedores.`, { tipo: 'aviso_admin', ...dataPush(a) })
  }
}

async function postFinalizado(admin, a, unidad) {
  await avisarAdmins(admin, a.edificio_id, '🏁 Trabajo finalizado', `${unidad} · ${a.titulo}. Confirmá para cerrar el reclamo.`, { tipo: 'finalizado', ...dataPush(a) })
  await avisar(admin, { user_id: a.vecino_id, rol: 'vecino' }, '🏁 Trabajo finalizado', `"${a.titulo}" quedó finalizado. Confirmá que está resuelto.`, { tipo: 'finalizado', ...dataPush(a) })
}

async function postPresupuestoPedido(admin, a, unidad) {
  await avisarAdmins(admin, a.edificio_id, '💬 El proveedor quiere presupuestar', `${a.proveedor_nombre} · ${unidad} · ${a.titulo}`, { tipo: 'presupuesto', ...dataPush(a) })
  await avisar(admin, { user_id: a.vecino_id, rol: 'vecino' }, '💬 El proveedor quiere presupuestar', `Coordiná una visita con ${a.proveedor_nombre} desde el chat de "${a.titulo}".`, { tipo: 'presupuesto', ...dataPush(a) })
}

async function postMensajeProveedor(admin, a, texto) {
  const quien = a.proveedor_nombre || 'Proveedor'
  await avisar(admin, { user_id: a.vecino_id, rol: 'vecino' }, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush(a) })
  await avisarAdmins(admin, a.edificio_id, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush(a) })
}

module.exports = { unidadDe, derivar, postAceptado, postNoPuede, postFinalizado, postPresupuestoPedido, postMensajeProveedor, tokensDe }
