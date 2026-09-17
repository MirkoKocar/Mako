# FixHub v31 — Qué hacer para que esta versión funcione

Esta versión no es "subir el ZIP y listo" como las anteriores: además de subir
el código a GitHub, hay que hacer 2 pasos manuales una sola vez. Sin estos
pasos, el login y las notificaciones push van a dejar de funcionar (a
propósito — son justamente los agujeros de seguridad que se cerraron).

---

## PASO 1 — Correr el SQL en Supabase

1. Andá a tu proyecto en https://supabase.com/dashboard
2. Menú izquierdo → **SQL Editor** → **New query**
3. Corré, en este orden, los dos archivos SQL que están en la raíz del ZIP:
   - `supabase_migration_v31_seguridad.sql` (seguridad — el importante)
   - `supabase_migration_v31b_cobro.sql` (control de activo/moroso)
   Copiá el contenido completo de cada uno, pegalo, tocá **Run**, y recién
   ahí pasá al siguiente archivo.
4. Si te da un error de "column does not exist" en algo puntual, avisame el
   mensaje exacto y lo ajustamos — el resto de la migración no se rompe por
   eso, cada tabla es independiente.

### Marcar tu cuenta como INFRA

Antes, escribir la palabra `INFRA` en el login te daba paso libre al panel
maestro sin ninguna verificación. Ahora hace falta que tu cuenta real
(email/contraseña) esté marcada como `infra` en la base. Para esto:

1. Iniciá sesión en la app con tu email y contraseña (la cuenta real que ya
   usás), como para entrar de vecino/admin — no hace falta llegar a ningún
   lado, con que exista la cuenta alcanza.
2. En Supabase → **Table Editor** → tabla `perfiles` → buscá la fila con tu
   `auth_user_id` (va a ser la única, o la más reciente si es la primera vez).
   Si no aparece ninguna fila todavía, corré este SQL reemplazando el email:

   ```sql
   insert into perfiles (auth_user_id, rol, nombre)
   select id, 'infra', 'Mirko'
   from auth.users where email = 'TU_EMAIL_ACA'
   on conflict (auth_user_id) do update set rol = 'infra';
   ```

3. Listo — con esa fila en `rol = 'infra'`, tu cuenta (y solo la tuya) puede
   entrar al panel escribiendo `INFRA`. Cualquier otra cuenta que lo intente
   ahora recibe "Esta cuenta no tiene acceso al panel INFRA."

---

## PASO 2 — Variables de entorno en Netlify

Andá a Netlify → tu sitio → **Site configuration** → **Environment
variables** → **Add a variable**, y cargá una por una las siguientes.

### Las de Supabase (necesarias para que send-push y el cron funcionen)

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | `https://qrxkrqfcltdoaqsggwal.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyeGtycWZjbHRkb2Fxc2dnd2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjU3ODAsImV4cCI6MjA5NzY0MTc4MH0.Qv8BqTHctSCvJ-eZkfiE8znU_7GNeqffij0_8u5cgr8` |
| `SUPABASE_SERVICE_ROLE_KEY` | La sacás de Supabase → **Project Settings** → **API** → **service_role key** (secreta — no la compartas, no la pongas en el código nunca) |

### Un secreto interno para las funciones (lo genero yo, es solo para este proyecto)

| Variable | Valor |
|---|---|
| `INTERNAL_FUNCTION_SECRET` | `YmrfqmF9bzbAiEmeLAFsbVp6dm2UYXEZChJ0suvzAic` |

(Podés cambiarlo por cualquier otra cadena larga y random si preferís — lo
importante es que sea el mismo valor que ya quedó puesto en el código de
`scheduled-notifications.js`, que lo lee de esta misma variable, así que con
copiar y pegar este ya alcanza.)

### Las de Firebase (¡MUY IMPORTANTE leer la nota de abajo antes!)

| Variable | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | `fixhub-2edf6` |
| `FIREBASE_PRIVATE_KEY_ID` | `93a1cf38cae452bbca9d815fbcdeece401d67645` |
| `FIREBASE_PRIVATE_KEY` | *(ver nota abajo — no uses la vieja)* |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@fixhub-2edf6.iam.gserviceaccount.com` |
| `FIREBASE_CLIENT_ID` | `115523369577407871495` |

> ⚠️ **Importante sobre la clave de Firebase**: la clave privada que estaba
> hasta la v30 ya quedó guardada en el historial de GitHub de versiones
> anteriores (aunque la saquemos del código ahora, sigue estando en commits
> viejos si el repo alguna vez se hace público o alguien tiene acceso a él).
> Por las dudas, antes de lanzar la app en serio, te recomiendo generar una
> clave NUEVA:
> 1. Firebase Console → ⚙️ **Configuración del proyecto** → **Cuentas de
>    servicio** → **Generar nueva clave privada**. Se descarga un `.json`.
> 2. De ese archivo, copiá el campo `"private_key"` completo (con los `\n`
>    incluidos, tal cual viene) como valor de `FIREBASE_PRIVATE_KEY` en
>    Netlify, y `"private_key_id"` como valor de `FIREBASE_PRIVATE_KEY_ID`.
> 3. Una vez que confirmes que las notificaciones funcionan con la clave
>    nueva, andá de nuevo a "Cuentas de servicio" y **borrá/revocá la clave
>    vieja** (la que ya estaba expuesta) para que quede inutilizada.
>
> Si querés arrancar rápido para probar, podés usar la clave vieja (te la
> paso si me la pedís) y rotarla más adelante — pero no lo dejes para
> después de publicar la app en Play Store.

### WhatsApp (opcional — solo si ya tenés la cuenta de Meta armada)

| Variable | Valor |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | el que te da Meta |
| `WHATSAPP_ACCESS_TOKEN` | el que te da Meta |
| `WHATSAPP_TEMPLATE_NAME` | el nombre de tu plantilla aprobada |

Si todavía no tenés esto armado, no pasa nada — la función simplemente no
manda el WhatsApp y no rompe nada más.

---

## PASO 3 — Redeployar y probar

Una vez cargadas las variables, Netlify necesita un redeploy para que las
tome (si ya subiste el ZIP a GitHub antes de cargarlas, andá a **Deploys** →
**Trigger deploy** → **Deploy site**).

Después, probá en orden:
1. Entrar como vecino nuevo (código `VEC-...`) — reportar un problema.
2. Entrar como admin (`ADM-...` + PIN) — ver que solo aparezcan TUS edificios.
3. Entrar como proveedor (`PRO-...`).
4. Escribir `INFRA` con tu cuenta marcada como infra — debería entrar. Con
   otra cuenta sin marcar — debería decir que no tiene acceso. Una vez
   adentro, probá crear un edificio nuevo y ver que la lista de edificios,
   vecinos, proveedores y avisos se sigan viendo bien.
5. Mandar un mensaje de chat con el wifi cortado a propósito, ver que ahora
   aparece "No se pudo enviar — tocá para reintentar" en vez de quedarse
   colgado en silencio. Probá lo mismo en el Tablón (reacciones, votos,
   mensaje privado al admin) y en "Reportar un problema".

Si algo de esto falla, mandame el mensaje de error exacto que te aparece
(o lo que salga en la consola del navegador con F12 → Console) y lo
arreglamos.

---

## Qué se agregó en esta vuelta (además de lo de la v31 original)

Además de los 6 cambios de la primera pasada, ahora también:

- **Manejo de errores en casi todas las pantallas** (Tablón, Reservas,
  Proveedores, Recordatorios, Agenda del proveedor, Emergencias, Visitas,
  Avisos del admin, Notificaciones de INFRA, Auth): si Supabase no responde
  o falla, la persona ve un mensaje claro y puede reintentar, en vez de
  quedarse con una pantalla que no hace nada o con datos que en realidad no
  se guardaron. Las acciones con "actualización optimista" (dar 👍, votar,
  cambiar el ranking de un proveedor, marcar un recordatorio como hecho)
  ahora **revierten el cambio visual** si la escritura real en la base
  falla, para que la pantalla nunca muestre algo distinto de lo que
  realmente quedó guardado.
- **Corregí un error mío**: el panel INFRA usaba la key del navegador para
  leer/crear/borrar edificios, vecinos, proveedores y avisos sin pasar por
  el filtro de "mi edificio" — con el RLS de la primera pasada eso se
  hubiera roto. Ya está agregado el permiso especial para que INFRA pueda
  seguir administrando todo, y quedó incluido en el mismo archivo SQL.
- **Control de cobro** (`supabase_migration_v31b_cobro.sql`): cada edificio
  tiene ahora un estado — Activo / Prueba / Moroso. Si lo marcás como
  Moroso desde el panel INFRA (un botoncito abajo de cada edificio, en la
  lista de Edificios), la app le bloquea el acceso a todos los que
  pertenecen a ese edificio (vecinos, admin y proveedores) hasta que lo
  vuelvas a poner en Activo. No borra nada, solo pausa el acceso.
- **Política de Privacidad y Términos y Condiciones**
  (`public/privacidad.html` y `public/terminos.html`): quedan publicados
  automáticamente en `tu-sitio.netlify.app/privacidad.html` y
  `/terminos.html` apenas subas esta versión — son las URLs que Google Play
  te va a pedir al completar la ficha de la app. **Importante: tienen 3
  campos para completar vos** (marcados con `[COMPLETAR...]`): tu email de
  contacto y el nombre/razón social bajo la que operás. Te recomiendo
  también que un abogado les dé una revisada antes de publicar, sobre todo
  la parte de cobro — son un buen punto de partida, no un documento legal
  definitivo. Agregué los links a estas dos páginas en Configuración,
  abajo del botón de cerrar sesión.
- **Guía para el administrador** (`public/guia-administrador.html`, se
  publica en `/guia-administrador.html`): una página en criollo para
  mandarle el link a un administrador de consorcio nuevo, explicando qué es
  la app y cómo usarla, sin tecnicismos.

## Lo que sigue quedando afuera de lo que yo puedo hacer

- **Probar la app de verdad en el edificio** (wifi real, celulares viejos,
  dos personas reportando al mismo tiempo) — esto necesita tu celular y el
  wifi real del edificio, no lo puedo simular yo.
- **Revisión legal profesional** de los dos documentos que te dejé — son un
  punto de partida honesto, no un reemplazo de un abogado.
- **Definir el mecanismo de cobro real** (transferencia, Mercado Pago,
  etc.) — yo agregué el control de "activo/moroso" para que lo puedas
  marcar a mano vos desde INFRA, pero conectar un cobro automático es una
  decisión de negocio tuya que además requeriría integrar una pasarela de
  pago, y eso sí es un desarrollo aparte cuando llegue el momento.
