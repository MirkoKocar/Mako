// npm run verificar            -> revisa que estén las variables y que tengan buen formato
// npm run verificar -- --twilio -> además chequea tus credenciales de Twilio contra Twilio (necesita internet)
// Lee el archivo .env (si existe) sin librerías. Las variables del sistema tienen prioridad.
const fs = require('fs')
const path = require('path')
function cargarEnv() {
  const f = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(f)) return false
  for (const linea of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || linea.trim().startsWith('#')) continue
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return true
}
const tieneEnv = cargarEnv()
const E = process.env
const filas = []
const ok = (t) => filas.push(['✅', t])
const mal = (t, ayuda) => filas.push(['❌', t, ayuda])
const aviso = (t, ayuda) => filas.push(['⚠️ ', t, ayuda])
const falta = (k) => !E[k] || !String(E[k]).trim()

console.log(tieneEnv ? 'Leyendo .env + variables del sistema\n' : 'No hay .env: uso solo las variables del sistema\n')

// Supabase
for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) falta(k) ? mal(k, 'Supabase → Project settings → API') : ok(k)

// Link seguro
if (falta('SITE_URL')) mal('SITE_URL', 'Tu dominio, ej: https://mako.com.ar')
else if (!/^https:\/\/[^/\s]+$/.test(E.SITE_URL)) mal('SITE_URL', 'Tiene que ser https y sin barra al final')
else ok('SITE_URL = ' + E.SITE_URL)
if (falta('LINK_ENC_KEY')) mal('LINK_ENC_KEY', `Generala: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
else {
  const raw = E.LINK_ENC_KEY.trim()
  const n = /^[0-9a-fA-F]{64}$/.test(raw) ? 32 : Buffer.from(raw, 'base64').length
  n === 32 ? ok('LINK_ENC_KEY (32 bytes)') : mal('LINK_ENC_KEY', `Tiene ${n} bytes y tienen que ser 32. Generá una nueva.`)
}

// WhatsApp
const prov = (E.WHATSAPP_PROVIDER || 'twilio').toLowerCase()
ok('WHATSAPP_PROVIDER = ' + prov)
if (prov === 'twilio') {
  falta('TWILIO_ACCOUNT_SID') ? mal('TWILIO_ACCOUNT_SID', 'Consola de Twilio → Account info') : /^AC[0-9a-f]{32}$/i.test(E.TWILIO_ACCOUNT_SID) ? ok('TWILIO_ACCOUNT_SID') : mal('TWILIO_ACCOUNT_SID', 'Empieza con AC y tiene 34 caracteres')
  falta('TWILIO_AUTH_TOKEN') ? mal('TWILIO_AUTH_TOKEN', 'Consola de Twilio → Account info') : String(E.TWILIO_AUTH_TOKEN).length === 32 ? ok('TWILIO_AUTH_TOKEN') : aviso('TWILIO_AUTH_TOKEN', 'Normalmente tiene 32 caracteres: revisalo')
  if (falta('TWILIO_WHATSAPP_FROM') && falta('TWILIO_MESSAGING_SERVICE_SID')) mal('TWILIO_WHATSAPP_FROM', 'whatsapp:+<tu número> (o TWILIO_MESSAGING_SERVICE_SID)')
  else if (!falta('TWILIO_WHATSAPP_FROM') && !/^whatsapp:\+\d{8,15}$/.test(E.TWILIO_WHATSAPP_FROM)) mal('TWILIO_WHATSAPP_FROM', 'Formato: whatsapp:+14155238886')
  else ok('Remitente de WhatsApp')
  if (E.TWILIO_SANDBOX === 'true') aviso('TWILIO_SANDBOX=true', 'Modo prueba (texto libre). Para producción poné false y cargá las plantillas aprobadas.')
  else for (const k of ['TRABAJO_NUEVO', 'MENSAJE_NUEVO', 'ACUERDO_NOVEDAD', 'RECORDATORIO', 'RECORDATORIO_FINALIZAR']) {
    const v = E['TWILIO_CONTENT_SID_' + k]
    falta('TWILIO_CONTENT_SID_' + k) ? mal('TWILIO_CONTENT_SID_' + k, 'SID (HX…) de la plantilla aprobada. Ver README.md (Plantillas de WhatsApp)') : /^HX[0-9a-f]{32}$/i.test(v) ? ok('TWILIO_CONTENT_SID_' + k) : mal('TWILIO_CONTENT_SID_' + k, 'Empieza con HX y tiene 34 caracteres')
  }
} else {
  for (const k of ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN']) falta(k) ? mal(k, 'Meta for Developers → WhatsApp → API Setup') : ok(k)
}

for (const [icono, texto, ayuda] of filas) console.log(icono, texto + (ayuda ? `\n     → ${ayuda}` : ''))

const errores = filas.filter(f => f[0] === '❌').length
const base = E.SITE_URL || 'https://tu-dominio.com'
console.log('\nWebhooks para cargar en Twilio (Messaging → tu número / Messaging Service):')
console.log('  Cuando llega un mensaje : ' + base + '/.netlify/functions/whatsapp-entrante   (POST)')
console.log('  Status callback         : ' + base + '/.netlify/functions/whatsapp-estado     (POST)')

;(async () => {
  if (process.argv.includes('--twilio') && prov === 'twilio' && !falta('TWILIO_ACCOUNT_SID') && !falta('TWILIO_AUTH_TOKEN')) {
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${E.TWILIO_ACCOUNT_SID}.json`, { headers: { Authorization: 'Basic ' + Buffer.from(`${E.TWILIO_ACCOUNT_SID}:${E.TWILIO_AUTH_TOKEN}`).toString('base64') } })
      const j = await r.json().catch(() => ({}))
      console.log(r.ok ? `\n✅ Twilio respondió: cuenta "${j.friendly_name}" (${j.status})` : `\n❌ Twilio rechazó las credenciales (HTTP ${r.status}). Revisá SID y Auth Token.`)
      if (!r.ok) process.exitCode = 1
    } catch { console.log('\n⚠️  No pude conectarme a Twilio (¿hay internet?).') }
  }
  console.log(errores ? `\n${errores} cosa(s) para arreglar antes de arrancar.` : '\nTodo en orden ✔  Siguiente: npm run probar-whatsapp -- 11 2233 4455')
  if (errores) process.exitCode = 1
})()
