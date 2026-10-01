# FixHub v35 — puesta en marcha

## 1. Supabase (SQL Editor → New query → pegar → Run), en este orden
1. `supabase_1_estructura_y_flujo.sql`
2. `supabase_2_login_y_cuenta.sql`
3. `supabase_3_seguridad.sql`
Cada una dice "Success". Si alguna da error, copiá el mensaje y avisame. Se pueden correr más de una vez.

## 2. Netlify → Site configuration → Environment variables
Tienen que estar: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (más las de Firebase que ya tenías).
Opcional: `SITE_URL` (solo si usás dominio propio) y `WHATSAPP_TEMPLATE_LINK_NAME` (plantilla de Meta con una variable {{1}} para el link).
Cambiá `INTERNAL_FUNCTION_SECRET` por uno nuevo si el zip anterior se compartió o se subió a GitHub.

## 3. Textos legales
Completá los `[COMPLETAR ...]` de `public/privacidad.html` y `public/eliminar-cuenta.html` (email, razón social). Que un abogado revise Términos y Privacidad.

## 4. Probar
- [ ] Vecino reporta con foto/video → al admin le llega la tarjeta.
- [ ] Admin: Autorizar y Derivar → enviar/copiar el link.
- [ ] Abrir el link en otro navegador: entra sin contraseña, ve el trabajo, Acepta.
- [ ] "No puedo ir"; Finalizar con monto + foto; confirmar vecino y admin → Más → Historial de gastos.
- [ ] Rechazar / Pedir más info; reglas en Más → Autorización automática.
- [ ] Eliminar cuenta (Configuración) con una cuenta de prueba.
