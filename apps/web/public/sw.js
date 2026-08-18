// Service worker mínimo: solo existe para recibir notificaciones push y
// abrir la prenda correcta al tocarlas. A propósito NO intercepta `fetch`
// ni guarda nada en caché — este proyecto decidió que la app siempre
// cargue la versión más reciente del servidor (ver proxy.ts), y un
// service worker que cachea rompería justo eso.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let datos;
  try {
    datos = event.data.json();
  } catch {
    return;
  }

  const { titulo, cuerpo, url, icono } = datos;

  event.waitUntil(
    self.registration.showNotification(titulo || 'Percha', {
      body: cuerpo || '',
      icon: icono || '/icono-192.png',
      badge: '/icono-192.png',
      data: { url: url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClientes) => {
      for (const cliente of listaClientes) {
        if (cliente.url.includes(destino) && 'focus' in cliente) return cliente.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    }),
  );
});
