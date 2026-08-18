import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

/**
 * IPs de la red local de esta máquina (Wi-Fi, Ethernet…), calculadas al
 * arrancar. Next.js bloquea por defecto las peticiones de desarrollo (el
 * websocket de recarga en caliente) que no vengan de localhost; sin esto,
 * abrir la app desde el celular por la IP de la red deja la página
 * reconectando en bucle y ningún formulario llega a enviarse. Se calculan
 * en vez de escribirlas a mano porque el router puede reasignar la IP.
 */
const ipsDeRedLocal = Object.values(networkInterfaces())
  .flat()
  .filter((i): i is NonNullable<typeof i> => Boolean(i) && i!.family === 'IPv4' && !i!.internal)
  .map((i) => i.address);

const nextConfig: NextConfig = {
  // packages/core se consume como TypeScript sin paso de build previo.
  transpilePackages: ['@percha/core'],

  // Solo importa en dev: permite abrir la app desde el celular en la
  // misma red sin que Next.js bloquee la recarga en caliente.
  allowedDevOrigins: ipsDeRedLocal,

  images: {
    // Las fotos se sirven desde Supabase Storage.
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/**' }]
      : [],
  },

  async headers() {
    return [
      {
        // TEMPORAL · solo desarrollo. Permite que el panel de Supabase lea
        // los archivos de migración desde este servidor para aplicarlos.
        // Se borra en cuanto la base esté montada.
        source: '/_mig/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
