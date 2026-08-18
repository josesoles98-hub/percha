import type { MetadataRoute } from 'next';

/**
 * Manifiesto de la PWA.
 *
 * Con esto la app se añade a la pantalla de inicio del iPhone y se abre a
 * pantalla completa, sin la barra de Safari. Es la diferencia entre "una
 * web que abro" y "una app que tengo".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Percha · Inventario',
    short_name: 'Percha',
    description: 'Tu inventario de ropa, listo para compartir en WhatsApp.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'es-PE',
    dir: 'ltr',
    categories: ['business', 'shopping', 'productivity'],
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icono-mascara.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        // Mantener pulsado el icono en la pantalla de inicio → subir prenda
        // directo, saltándose el inventario.
        name: 'Subir prenda',
        short_name: 'Subir',
        url: '/nueva',
      },
    ],
  };
}
