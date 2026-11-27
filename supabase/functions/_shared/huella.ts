// "Huella" de una foto: un resumen chiquito que sirve para encontrar la
// misma foto aunque WhatsApp la haya recomprimido o achicado.
//
// Los clientes suelen reenviar la foto tal cual la publicaste en el grupo.
// Comparar esa foto contra las ~2000 de Percha con IA sería caro; con la
// huella se encuentran en milisegundos las pocas más parecidas, y recién
// esas se le muestran a Claude para confirmar.
//
// Formato: "<dhash 16 hex>:<color 4x4 RGB, 96 hex>"
//   · dhash: 64 bits de "¿este punto es más claro que el de al lado?" en
//     una miniatura gris de 9×8. Resiste recompresión y cambios de tamaño.
//   · color: el color promedio de 16 zonas. Distingue prendas de forma
//     parecida sobre el mismo fondo (todas tus fotos son en el mismo piso).

import jpeg from 'npm:jpeg-js@0.4.4';

/** Promedia la imagen RGBA en una grilla de cols×filas (cada celda un área). */
function grilla(datos: Uint8Array, ancho: number, alto: number, cols: number, filas: number) {
  const suma = new Float64Array(cols * filas * 3);
  const cuenta = new Float64Array(cols * filas);
  // Saltar píxeles en fotos grandes: con ~250k muestras alcanza y sobra.
  const paso = Math.max(1, Math.floor(Math.sqrt((ancho * alto) / 250_000)));
  for (let y = 0; y < alto; y += paso) {
    const fy = Math.min(filas - 1, Math.floor((y * filas) / alto));
    for (let x = 0; x < ancho; x += paso) {
      const fx = Math.min(cols - 1, Math.floor((x * cols) / ancho));
      const c = fy * cols + fx;
      const i = (y * ancho + x) * 4;
      suma[c * 3] += datos[i];
      suma[c * 3 + 1] += datos[i + 1];
      suma[c * 3 + 2] += datos[i + 2];
      cuenta[c]++;
    }
  }
  const out = new Float64Array(cols * filas * 3);
  for (let c = 0; c < cols * filas; c++) {
    const n = cuenta[c] || 1;
    out[c * 3] = suma[c * 3] / n;
    out[c * 3 + 1] = suma[c * 3 + 1] / n;
    out[c * 3 + 2] = suma[c * 3 + 2] / n;
  }
  return out;
}

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** Huella de una foto JPEG. null si no se puede leer. */
export function huellaDeJpeg(bytes: Uint8Array): string | null {
  let img: { width: number; height: number; data: Uint8Array };
  try {
    img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 256, formatAsRGBA: true });
  } catch {
    return null;
  }
  const { width: w, height: h, data } = img;
  if (!w || !h) return null;

  const g = grilla(data, w, h, 9, 8);
  const gris = (c: number) => 0.299 * g[c * 3] + 0.587 * g[c * 3 + 1] + 0.114 * g[c * 3 + 2];
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits += gris(y * 9 + x) > gris(y * 9 + x + 1) ? '1' : '0';
  }
  let dhash = '';
  for (let i = 0; i < 64; i += 4) dhash += parseInt(bits.slice(i, i + 4), 2).toString(16);

  const color = grilla(data, w, h, 4, 4);
  let colores = '';
  for (const v of color) colores += hex(v);
  return `${dhash}:${colores}`;
}

/**
 * Qué tan distintas son dos huellas (0 = idénticas). Bits distintos del
 * dhash (0–64) + diferencia promedio de color (0–255) / 4.
 * Misma foto recomprimida: ~0–6. Prendas distintas: casi siempre > 20.
 */
export function distancia(a: string, b: string): number {
  const [da, ca] = a.split(':');
  const [db, cb] = b.split(':');
  if (!da || !db || da.length !== 16 || db.length !== 16) return 999;
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(da[i], 16) ^ parseInt(db[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  let color = 0;
  if (ca && cb && ca.length === cb.length) {
    for (let i = 0; i < ca.length; i += 2) {
      color += Math.abs(parseInt(ca.slice(i, i + 2), 16) - parseInt(cb.slice(i, i + 2), 16));
    }
    color /= ca.length / 2;
  }
  return bits + color / 4;
}
