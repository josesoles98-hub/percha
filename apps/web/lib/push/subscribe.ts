import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Suscripción a notificaciones push del navegador.
 *
 * Solo funciona si la app está instalada en la pantalla de inicio (PWA) y
 * en iOS 16.4+; en otros casos `soportaPush()` devuelve false y la pantalla
 * de publicar ofrece el modo con la app abierta en primer plano.
 */

export function soportaPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** El endpoint de la clave pública viene en base64url; PushManager lo pide en bytes. */
function base64UrlABytes(base64Url: string): Uint8Array {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

export type ResultadoSuscripcion =
  | { ok: true }
  | { ok: false; motivo: 'sin-soporte' | 'permiso-denegado' | 'error'; error?: string };

export async function suscribirNotificaciones(
  supabase: SupabaseClient,
  storeId: string,
): Promise<ResultadoSuscripcion> {
  if (!soportaPush()) return { ok: false, motivo: 'sin-soporte' };

  const claveVapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!claveVapid) return { ok: false, motivo: 'error', error: 'Falta configurar las notificaciones' };

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'permiso-denegado' };

  try {
    const registro = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlABytes(claveVapid) as BufferSource,
      });
    }

    const json = suscripcion.toJSON();
    const claves = json.keys;
    if (!json.endpoint || !claves?.p256dh || !claves.auth) {
      return { ok: false, motivo: 'error', error: 'No se pudo leer la suscripción' };
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        store_id: storeId,
        endpoint: json.endpoint,
        p256dh: claves.p256dh,
        auth: claves.auth,
      },
      { onConflict: 'endpoint' },
    );

    if (error) return { ok: false, motivo: 'error', error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      motivo: 'error',
      error: error instanceof Error ? error.message : 'No se pudo activar',
    };
  }
}
