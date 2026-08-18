#!/bin/bash
# Publica Percha en Vercel: asegura que las credenciales públicas de
# Supabase estén configuradas (si ya existen de una vez anterior, se
# ignora en vez de fallar) y despliega la versión final a producción.
set -e

cd "$(dirname "$0")"

echo "── Comprobando las credenciales de Supabase ──"
echo "https://kygwgushdpishqrceygu.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production 2>/dev/null \
  && echo "  NEXT_PUBLIC_SUPABASE_URL: creada" \
  || echo "  NEXT_PUBLIC_SUPABASE_URL: ya existía, sin cambios"
echo "sb_publishable_YLEShYkB3O500GxymHOtJQ_xVKVY3Mr" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production 2>/dev/null \
  && echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY: creada" \
  || echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY: ya existía, sin cambios"
echo "BBtP8tmimgMGIz53Or1wS2myjN7nKp51QCqqFATpwlShYbxxyyXFsF9IYklwOZBcF6CXDy4c84O04yDDvDKEppA" | vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production 2>/dev/null \
  && echo "  NEXT_PUBLIC_VAPID_PUBLIC_KEY: creada" \
  || echo "  NEXT_PUBLIC_VAPID_PUBLIC_KEY: ya existía, sin cambios"

echo ""
echo "── Publicando en producción ──"
vercel --prod --yes

echo ""
echo "Listo. La URL de tu app aparece arriba, junto a 'Production:'."
