/**
 * UUID v4 para el navegador, con respaldo cuando `crypto.randomUUID` no
 * existe.
 *
 * Safari (y por tanto todo navegador en iOS) solo expone `randomUUID` en
 * contextos seguros: HTTPS, o `localhost`. Abrir la app desde el celular
 * por la IP de la red local (`http://192.168.x.x`) no cuenta como seguro,
 * así que ahí `crypto.randomUUID` no existe y la llamada revienta.
 * `crypto.getRandomValues` no tiene esa restricción, así que sirve de base
 * para construir el UUID a mano en ese caso.
 */
export function idUnico(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
