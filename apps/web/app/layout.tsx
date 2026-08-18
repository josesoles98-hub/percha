import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Percha',
    template: '%s · Percha',
  },
  description: 'Tu inventario de ropa, listo para compartir en WhatsApp.',
  applicationName: 'Percha',
  appleWebApp: {
    capable: true,
    // 'default' deja la barra de estado con fondo propio; con el diseño a
    // sangre queda mejor que se funda con la app.
    statusBarStyle: 'black-translucent',
    title: 'Percha',
  },
  formatDetection: {
    // Sin esto, iOS convierte los códigos de prenda en enlaces de teléfono.
    telephone: false,
  },
  // El inventario es privado: no tiene sentido que lo indexe un buscador.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom rompe la accesibilidad.
  viewportFit: 'cover', // usa toda la pantalla del iPhone, hasta los bordes
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body>{children}</body>
    </html>
  );
}
