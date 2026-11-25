# MAKO / FixHub v39 — puesta en marcha

> **Camino corto:** sección «Puesta en marcha» (10 pasos) y `.env.example`. Lo demás es el detalle.

**Novedades v39:** si un proveedor dice "No puedo", la app le pasa el trabajo sola a otro del mismo edificio y rubro y te avisa. Mínimo de 2 proveedores por rubro para derivar. Alerta al admin si el rubro del reporte no tiene proveedor.

**Novedad v38:** el proveedor trabaja desde un link seguro por trabajo (`/t/<token>`), sin cuenta ni instalar nada. Le llega por WhatsApp (Twilio).

## 1. Supabase
Pegá y corré, en orden, **`PARTE 5`** y **`PARTE 6`** de `supabase.sql` (SQL Editor → New query → Run). Son idempotentes.
Ya tenés que tener las partes 1 a 4 (todas están en `supabase.sql`).
Control 5: `select to_regclass('public.acuerdos') is not null;` → `true`.
Control 6: `select min_proveedores_especialidad from edificios limit 1;` → `2`.

⚠️ Con la parte 6, un edificio con **un solo** proveedor en un rubro no puede derivar trabajos de ese rubro hasta cargar un segundo (la app te lo avisa y te lleva a cargarlo). El rubro "Otro" queda afuera. Para cambiar el mínimo: `update edificios set min_proveedores_especialidad = 1 where id = '…';` (solo desde SQL, el admin no puede bajarlo).

## 2. Netlify — variables nuevas
Subí el zip. Además de las que ya tenías (`SUPABASE_*`, Firebase):

| Variable | Qué es |
|---|---|
| `LINK_ENC_KEY` | Clave para cifrar los links (32 bytes). Generala: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Guardala: si la perdés, no se pueden reenviar los links viejos.** |
| `SITE_URL` | `https://tu-dominio.com` (sin barra al final) |
| `WHATSAPP_PROVIDER` | `twilio` (por defecto) o `meta` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | De la consola de Twilio |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+<número dedicado>` |
| `TWILIO_MESSAGING_SERVICE_SID` | Opcional (si lo usás, reemplaza al FROM) |
| `TWILIO_CONTENT_SID_TRABAJO_NUEVO` | SID `HX…` de la plantilla a) |
| `TWILIO_CONTENT_SID_MENSAJE_NUEVO` | plantilla b) |
| `TWILIO_CONTENT_SID_ACUERDO_NOVEDAD` | plantilla c) |
| `TWILIO_CONTENT_SID_RECORDATORIO` | plantilla d) |
| `TWILIO_CONTENT_SID_RECORDATORIO_FINALIZAR` | plantilla e) (extra, ver «Plantillas de WhatsApp» más abajo) |
| `TWILIO_SANDBOX` | `true` solo para probar con texto libre |
| `PROVEEDOR_ACCESO_LEGACY` | No la pongas. (Reactiva el canje viejo por sesión real.) |

Para `WHATSAPP_PROVIDER=meta`: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` y plantillas con los mismos nombres (o `META_TEMPLATE_<NOMBRE>`).

## 3. Twilio — paso a paso
1. Cuenta Twilio → **Messaging → Senders → WhatsApp senders**: registrá tu número dedicado (Meta Business).
2. **Content Template Builder**: creá las plantillas de «Plantillas de WhatsApp» (abajo) (Utility, es_AR, botón URL dinámico). Copiá cada SID `HX…` a su variable.
3. Mandalas a aprobar. Hasta que estén aprobadas usá `TWILIO_SANDBOX=true`.
4. En el número (o Messaging Service) cargá los webhooks:
   - **When a message comes in** → `https://tu-dominio.com/.netlify/functions/whatsapp-entrante` (POST)
   - **Status callback URL** → `https://tu-dominio.com/.netlify/functions/whatsapp-estado` (POST)
5. La URL cargada tiene que ser **igual a `SITE_URL`** + la ruta (la firma `X-Twilio-Signature` se calcula con ella).
6. Sandbox: el proveedor manda `join <palabra>` al número del sandbox desde su WhatsApp.

## 4. Proveedores
- Al cargar uno: celular argentino (se guarda como `549…`) y **casilla de consentimiento obligatoria**.
- Los proveedores de antes quedan **sin consentimiento**: en *Proveedores* tocá "registrarlo". Sin eso no se les manda WhatsApp (el link igual se puede pasar a mano).
- Si responde **BAJA** deja de recibir avisos y te llega una notificación. **ALTA** lo reactiva.

## 5. Opción por edificio
*Configuración → Trabajos con proveedores → Exigir acuerdo antes de finalizar* (apagado por defecto).

## 6. Cómo funciona el link (resumen)
- Dura mientras el reclamo esté en derivado / en camino / finalizado. Se revoca solo al cerrar, rechazar, reasignar, cancelar o desvincular al proveedor. Tope: 60 días.
- Mismo link en todos los avisos del trabajo. "Reenviar" manda el mismo; "Revocar" lo mata.
- `proveedor-acceso.js` y `ProveedorAcceso.jsx` quedan **sin uso** (la función responde 410).

## 7. Recordatorios (cron cada 5 min)
Urgente: a las 2 h sin respuesta; resto: a las 12 h. Si sigue sin responder: aviso al admin (1 h / 6 h después). En camino sin finalizar: 8 h urgente / 24 h resto, cada 48 h, máx. 3. No urgentes: no se mandan de 22 a 8 h.

## 8. "No puedo" y reasignación automática
El proveedor toca **No puedo** (en su link o en la app) → la base elige al siguiente del mismo edificio y rubro que esté disponible y no haya dicho que no en ese reclamo (prefiere a quien tiene WhatsApp autorizado, después por ranking) → recibe su link por WhatsApp → vos recibís el aviso "Reasignado automáticamente". Si no queda ninguno, el reclamo vuelve a "Por autorizar" y te avisa.

## 9. Pruebas y pendientes
Ver «Pruebas manuales» al final.

## 10. Chequeos y prueba de envío
`npm run verificar` · `npm run probar-whatsapp -- 11 2233 4455`

## Otros (sin cambios)
- Textos legales: completá `[COMPLETAR …]` en `public/privacidad.html` y `public/eliminar-cuenta.html`; que un abogado los revise.
- Redes: `src/pages/Auth.jsx`, `REDES`.
- Play Store: la app es una PWA instalable; falta la cuenta de desarrollador.

---

# Puesta en marcha — 10 pasos

**1. Base de datos.** En Supabase → SQL Editor, pegá y corré en orden (las que te falten): `PARTE 5` y `PARTE 6` de `supabase.sql`.

**2. Claves.** Copiá `.env.example` como `.env` y completalo. Generá `LINK_ENC_KEY` con el comando que dice el archivo y guardala.

**3. Instalar.** En la carpeta del proyecto:
```
npm install
npm run instalar-funciones
```

**4. Verificar.** `npm run verificar` te marca ✅/❌ cada variable y te imprime las 2 URLs de webhook. Con `-- --twilio` prueba tus credenciales contra Twilio.

**5. Twilio (modo prueba).** Consola → Messaging → Try it out → WhatsApp sandbox. Desde tu celular mandá `join <palabra>` al número del sandbox. En `.env`: `TWILIO_SANDBOX=true` y `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`.

**6. Probar el envío.** `npm run probar-whatsapp -- 11 2233 4455` (tu celular). Tiene que llegarte el mensaje.

**7. Netlify.** Cargá las mismas variables en Site configuration → Environment variables y subí el zip. Cuando termine el deploy, en Twilio cargá los webhooks:
- Mensaje entrante → `<SITE_URL>/.netlify/functions/whatsapp-entrante`
- Status callback → `<SITE_URL>/.netlify/functions/whatsapp-estado`

**8. Cargar proveedores.** En la app (admin): mínimo **2 por rubro**, con la casilla de consentimiento. Los de antes: "registrarlo".

**9. Recorrido de prueba.** Vecino manda un reporte → admin lo autoriza (ve la vista previa del WhatsApp) → llega el WhatsApp → abrir el link → probar "No puedo" y ver que pasa solo al otro proveedor y te avisa.

**10. Producción.** Registrá tu número en Twilio, creá y mandá a aprobar las 5 plantillas (sección «Plantillas de WhatsApp»), cargá los 5 `TWILIO_CONTENT_SID_*` y poné `TWILIO_SANDBOX=false`. Corré `npm run verificar` de nuevo.

Checklist completo: sección «Pruebas manuales».

---

## Plantillas de WhatsApp (Twilio Content Templates)

Para todas: **categoría Utility · idioma es_AR · tipo "Call to action" con botón de URL**.
**Footer fijo:** `Respondé BAJA para no recibir más avisos`
**Botón URL dinámico:** `https://<tu-dominio>/t/{{N}}` — la última variable es el token. Ya viene puesta por el sistema.
Las variables **no llevan saltos de línea** ni 4 espacios seguidos.

### a) `trabajo_nuevo` — botón "Ver trabajo" — URL `https://<dominio>/t/{{7}}`
```
Hola {{1}}, tenés un trabajo nuevo de {{2}} en {{3}}, depto {{4}}. Urgencia: {{5}}. Problema: {{6}}. Tocá el botón para aceptarlo, pedir presupuesto o avisar si no podés.
```
{{1}} nombre de pila del proveedor · {{2}} rubro · {{3}} edificio · {{4}} depto · {{5}} urgencia (Alta/Media/Baja) · {{6}} título + resumen de ~100 caracteres (sin teléfonos, emails ni links) + nota del admin si hay.

### b) `mensaje_nuevo` — botón "Responder" — URL `https://<dominio>/t/{{5}}`
```
Hola {{1}}, {{2}} te escribió por el trabajo '{{3}}': {{4}}. Tocá el botón para responder.
```
{{2}} quién escribió (vecino / administrador) · {{3}} título · {{4}} el mensaje, o "tenés N mensajes nuevos" si hay varios.

### c) `acuerdo_novedad` — botón "Ver acuerdo" — URL `https://<dominio>/t/{{4}}`
```
Hola {{1}}, hay novedades en el acuerdo del trabajo '{{2}}': {{3}}. Entrá para verlo.
```

### d) `recordatorio_trabajo` — botón "Ver trabajo" — URL `https://<dominio>/t/{{3}}`
```
Hola {{1}}, el trabajo '{{2}}' sigue esperando tu respuesta. Tocá el botón para verlo.
```

### e) `recordatorio_finalizar` (EXTRA, no estaba en el pedido) — botón "Ver trabajo" — URL `https://<dominio>/t/{{3}}`
```
Hola {{1}}, el trabajo '{{2}}' sigue abierto. Si ya lo terminaste, tocá el botón para marcarlo como finalizado.
```
La d) dice "sigue esperando tu respuesta", que no cuadra con un trabajo ya aceptado. Sin esta plantilla (e) **no sale** el recordatorio de "marcá como finalizado".

### Reglas de envío
- Máximo **1 WhatsApp de novedades cada 10 min por trabajo** (mensajes y acuerdo se agrupan).
- Solo si el proveedor no tiene la página abierta (sin actividad en 60 s).
- Nunca sin consentimiento ni después de un BAJA.
- Con `TWILIO_SANDBOX=true` se manda texto libre con el mismo contenido + el link.

---

## Pruebas manuales y pendientes (v38)

### Checklist (marcá a medida que probás)
**Base y deploy**
- [ ] Corrí `PARTE 5` de `supabase.sql` sin errores (y una 2ª vez, sin errores).
- [ ] Variables de Netlify cargadas (`LINK_ENC_KEY`, `SITE_URL`, Twilio).
- [ ] El login por código y un proveedor ya registrado siguen funcionando.

**Link /t (en un celular, sin sesión)**
- [ ] Autorizar un reclamo → el proveedor recibe el WhatsApp (sandbox o plantilla) con botón.
- [ ] Abre el link: pide términos una vez; la URL pasa a `/t`; recargar sigue andando; en otra pestaña pide el link de nuevo.
- [ ] Ve edificio, "Depto X", nombre de pila, fotos. **No** ve teléfono ni apellido del vecino.
- [ ] Acepto / Pido presupuesto / No puedo (con motivo) → el admin y el vecino reciben el aviso.
- [ ] Sin conexión o link inválido: mensaje genérico "Este link ya no está activo…".
- [ ] Cerrar el reclamo / reasignar / revocar → el link da 410. El proveedor nuevo recibe uno propio.
- [ ] 21 links inventados seguidos desde la misma IP → queda frenada unos minutos.

**Chat supervisado**
- [ ] Vecino y proveedor ven "Esta conversación la supervisa el administrador".
- [ ] Teléfono, email o link en un mensaje → retenido; el admin lo ve y lo **libera**; recién ahí le llega a la otra parte.
- [ ] Admin "Pausar chat": proveedor y vecino leen pero no escriben. "Reanudar" lo reabre.
- [ ] Notas internas: el proveedor no las ve.
- [ ] El proveedor con la pestaña abierta ve mensajes nuevos en ≤ 5 s; con la pestaña oculta no consulta.
- [ ] Foto en el chat y comprobante al finalizar (subida con URL firmada).

**Acuerdo**
- [ ] Proveedor propone → vecino acepta → admin aprueba. Sin aprobación no vale.
- [ ] Con "Exigir acuerdo" activado, no se puede finalizar sin acuerdo aprobado. Apagado: todo como antes.
- [ ] Historial visible en *Historial de gastos* y columna "Monto acordado" en el CSV.

**Reasignación automática y mínimo de proveedores (v39)**
- [ ] Rubro sin proveedores: el reporte llega al admin con "🚫 No hay proveedor de X cargado" y el push lo dice.
- [ ] Rubro con 1 proveedor: avisa "faltan 1 para el mínimo (2)" y no deja derivar hasta cargar otro.
- [ ] Proveedores: resumen por rubro (ej. Plomería 1/2) y botón "cargar".
- [ ] "No puedo" por el link: pasa solo a otro del mismo rubro; llega WhatsApp al nuevo; el admin recibe "🔄 Reasignado automáticamente" con el motivo.
- [ ] "No puedo" desde la app (proveedor registrado): igual.
- [ ] Si nadie más puede: vuelve a "Por autorizar" y el admin recibe "⚠️ Ningún proveedor pudo".
- [ ] Nunca vuelve a un proveedor que ya dijo que no en ese reclamo.

**WhatsApp**
- [ ] Vecino escribe con la página cerrada → llega `mensaje_nuevo` con el MISMO link.
- [ ] 3 mensajes seguidos → un solo WhatsApp ("tenés N mensajes nuevos"), máx. cada 10 min.
- [ ] El estado (enviado / entregado / leído / fallido) aparece en el reclamo.
- [ ] Fallo → notificación al admin + botón "Enviar a mano por WhatsApp".
- [ ] Responder BAJA → deja de recibir, te avisan. ALTA → vuelve.
- [ ] Recordatorios: 2 h (urgente) / 12 h (resto), después aviso al admin; y "marcá como finalizado".
- [ ] Proveedor sin consentimiento: no se le manda nada.

### Qué se probó y qué no (en el desarrollo)
**Probado de verdad** (Postgres + PostgREST + supabase-js locales, 99 comprobaciones; incluye la reasignación automática en cadena y el mínimo de proveedores): migración y su 2ª corrida, permisos y RLS, triggers (retención de contactos, pausa, acuerdo requerido, revocación automática), todas las acciones de `trabajo-link`, agrupado de WhatsApp, webhooks con firma de Twilio, cron de recordatorios, cifrado del token, normalización de teléfonos. También el build y un render de `/t` con jsdom.
**NO probado:** Twilio real (envío, plantillas, botón URL dinámico), Meta, Supabase Storage real (URLs firmadas y la subida `PUT` desde el navegador), Netlify real (redirects, cabeceras CSP en `/t/*`), el navegador real en celulares, push de Firebase.

### Pendientes / cosas a saber
1. **Subida de fotos desde `/t`**: usa `PUT` directo a la URL firmada de Supabase con `apikey`. Hay que probarlo con un celular; si falla, avisame.
2. **CSP de `/t`**: está en modo enforcing. Mirá la consola del navegador la primera vez.
3. **Plantilla e)** (`recordatorio_finalizar`) es una adición mía: hay que crearla y aprobarla.
4. **Proveedores ya registrados con sesión** (login por código) siguen viendo campos del reclamo con `select('*')` (p. ej. `contacto_telefono` en reclamos viejos). El problema 1 quedó resuelto para el flujo por link, no para esas sesiones.
5. El proveedor por link **no** tiene push (sin Firebase): depende del WhatsApp.
6. Si falta `LINK_ENC_KEY`, el link funciona pero no se puede reenviar el mismo (se crea uno nuevo).
7. No hay webhook de estado para el driver Meta (solo queda "enviado").
8. "Pido presupuesto" lo interpreté así: el proveedor avisa que quiere presupuestar (queda un mensaje fijo en el chat y se abre el chat) y después manda el presupuesto como propuesta de acuerdo. Cambialo si lo pensabas distinto.
9. Un número de 8+ dígitos (ej. un monto de $12.500.000) en el chat se retiene como si fuera teléfono; el admin lo libera.
10. Límite de intentos por IP: 20 tokens inexistentes cada 15 min (solo cuenta intentos de adivinar, no el uso normal).
11. No hay chequeo de `Origin` en `trabajo-link` (el token es la credencial).
