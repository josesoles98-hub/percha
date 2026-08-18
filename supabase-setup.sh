#!/bin/bash
# Configura Supabase para la cola de publicación automática: conecta el
# proyecto, aplica TODAS las migraciones pendientes (incluida esta y
# alguna vieja que quedó sin aplicar), publica la Función Edge que manda
# los avisos, y le da sus claves VAPID.
#
# Este script NO toca tu clave de administración (service_role): esa la
# tienes que pegar tú misma, a mano, en un solo paso — se explica abajo.
set -e

cd "$(dirname "$0")"

echo "── Paso 1 de 4: iniciar sesión en Supabase ──"
echo "Se va a abrir el navegador para que apruebes el acceso."
npx supabase login

echo ""
echo "── Paso 2 de 4: conectar este proyecto con tu base de datos ──"
npx supabase link --project-ref kygwgushdpishqrceygu

echo ""
echo "── Paso 3 de 4: aplicar las migraciones pendientes ──"
npx supabase db push

echo ""
echo "── Paso 4 de 4: publicar la función que manda los avisos ──"
npx supabase functions deploy publicar-cola

# La clave PRIVADA no vive en este archivo (no es como la pública, esta sí
# hay que cuidarla) — te la paso en el chat, pégala aquí cuando la pida:
read -r -p "Pega la clave privada VAPID (la de esta conversación) y presiona Enter: " VAPID_PRIVATE_KEY_PEGADA

npx supabase secrets set \
  VAPID_PUBLIC_KEY="BBtP8tmimgMGIz53Or1wS2myjN7nKp51QCqqFATpwlShYbxxyyXFsF9IYklwOZBcF6CXDy4c84O04yDDvDKEppA" \
  VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY_PEGADA" \
  VAPID_SUBJECT="mailto:josesoles98@gmail.com"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Casi listo. Falta UN paso a mano — no lo puedo hacer yo porque"
echo "necesita tu clave de administración, que nunca debo ver:"
echo ""
echo "1. Ve a supabase.com/dashboard → tu proyecto → Settings → API"
echo "2. Copia la clave 'service_role' (dice 'secret', no la publiques)"
echo "3. Ve a SQL Editor → New query, PEGA esta línea reemplazando"
echo "   TU_CLAVE_AQUI por lo que copiaste, y dale Run:"
echo ""
echo "   select vault.create_secret('TU_CLAVE_AQUI', 'service_role_key');"
echo ""
echo "Con eso, el aviso de \"toca publicar\" ya debería funcionar solo."
echo "════════════════════════════════════════════════════════════════"
