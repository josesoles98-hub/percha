/**
 * Preparación de fotos en el navegador, antes de subirlas.
 *
 * Una foto de iPhone pesa 3-5 MB. Comprimida a ~200 KB, la subida pasa de 8
 * segundos a menos de 1 con datos móviles, y el almacenamiento cunde diez
 * veces más. Esta compresión es la diferencia entre cumplir los 20 segundos
 * y no cumplirlos — y con el inventario creciendo a cientos de prendas,
 * también es la diferencia entre que la cuadrícula cargue de golpe o que
 * cada scroll tenga que bajar varios MB de fotos.
 */

const MAX_LADO = 1280;
const CALIDAD = 0.78;
const OBJETIVO_MB = 0.25;

// Segunda copia, solo para compartir por WhatsApp. La normal de arriba es la
// que usan la cuadrícula y las fichas y tiene que seguir siendo liviana; si
// WhatsApp recibiera esa, la foto saldría achicada aunque el original fuera
// HD. Esta se sube aparte y nunca se baja para navegar, solo al compartir.
const MAX_LADO_HD = 2048;
const CALIDAD_HD = 0.85;
// 2 MB: con menos, la librería achicaba las fotos con mucho detalle por
// debajo de 2048 px (salían de 1600) para entrar en el peso.
const OBJETIVO_MB_HD = 2;

// Opción "máxima": cerca del tope de 4096 px que usa WhatsApp en HD (se
// queda en 4000 para no rozar el límite de 16.7 millones de píxeles de los
// canvas de iPhone). Calidad casi sin pérdida; el tope de peso solo evita
// que una foto rara dispare el almacenamiento.
export const LADO_HD_ALTA = 2048;
export const LADO_HD_MAXIMA = 4000;
const CALIDAD_HD_MAXIMA = 0.92;
const OBJETIVO_MB_HD_MAXIMA = 5;

export interface FotoPreparada {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  /** URL local para la vista previa inmediata. Hay que revocarla al soltar. */
  previewUrl: string;
}

export interface FotoHdPreparada {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

/** ¿Es HEIC/HEIF? Es el formato por defecto de la cámara del iPhone. */
function esHeic(file: File): boolean {
  const tipo = file.type.toLowerCase();
  if (tipo === 'image/heic' || tipo === 'image/heif') return true;
  // Safari a veces entrega el archivo con type vacío: hay que mirar el nombre.
  return /\.(heic|heif)$/i.test(file.name);
}

/**
 * HEIC → JPEG. La librería pesa bastante, así que se carga solo cuando
 * aparece una foto HEIC de verdad, no en el bundle inicial.
 */
async function convertirHeic(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const resultado = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  return Array.isArray(resultado) ? (resultado[0] as Blob) : (resultado as Blob);
}

async function medir(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const bitmap = await createImageBitmap(blob);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  } catch {
    return { width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Deja el original como JPEG. Si es HEIC lo convierte (lo más caro de todo
 * el proceso), así que se hace UNA sola vez y de ahí salen la copia normal
 * y la HD.
 */
export async function aJpeg(file: File): Promise<File> {
  const origen: Blob = esHeic(file) ? await convertirHeic(file) : file;
  return new File([origen], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

/**
 * Comprime. Se ejecuta en un Web Worker cuando el navegador lo permite,
 * para que el hilo principal siga respondiendo mientras el usuario teclea
 * el precio.
 */
async function comprimirJpeg(
  archivo: File,
  opciones: { maxSizeMB: number; maxWidthOrHeight: number; initialQuality: number },
): Promise<Blob> {
  const { default: comprimir } = await import('browser-image-compression');
  const base = { ...opciones, fileType: 'image/jpeg' };

  try {
    return await comprimir(archivo, { ...base, useWebWorker: true });
  } catch {
    // El Web Worker de la librería puede fallar en un contexto no seguro
    // (probando por la IP de la red local en vez de https o localhost).
    // Sin este respaldo, una prenda se guardaba sin foto y sin ningún aviso.
    return comprimir(archivo, { ...base, useWebWorker: false });
  }
}

/** Copia normal (liviana) a partir de un original ya en JPEG. */
export async function prepararFotoDesdeJpeg(jpeg: File): Promise<FotoPreparada> {
  const comprimida = await comprimirJpeg(jpeg, {
    maxSizeMB: OBJETIVO_MB,
    maxWidthOrHeight: MAX_LADO,
    initialQuality: CALIDAD,
  });

  const { width, height } = await medir(comprimida);

  return {
    blob: comprimida,
    width,
    height,
    bytes: comprimida.size,
    previewUrl: URL.createObjectURL(comprimida),
  };
}

/**
 * Copia HD a partir de un original ya en JPEG: hasta 2048 px ("alta") o
 * 4000 px ("máxima"). Nunca agranda: un original más chico queda como está.
 */
export async function prepararFotoHd(
  jpeg: File,
  maxLado: number = LADO_HD_ALTA,
): Promise<FotoHdPreparada> {
  const maxima = maxLado >= LADO_HD_MAXIMA;
  const comprimida = await comprimirJpeg(jpeg, {
    maxSizeMB: maxima ? OBJETIVO_MB_HD_MAXIMA : OBJETIVO_MB_HD,
    maxWidthOrHeight: maxima ? LADO_HD_MAXIMA : MAX_LADO_HD,
    initialQuality: maxima ? CALIDAD_HD_MAXIMA : CALIDAD_HD,
  });

  const { width, height } = await medir(comprimida);

  return { blob: comprimida, width, height, bytes: comprimida.size };
}

/** Convierte y comprime (solo la copia normal). */
export async function prepararFoto(file: File): Promise<FotoPreparada> {
  return prepararFotoDesdeJpeg(await aJpeg(file));
}

/** Ruta en Storage. El store_id va primero porque la política RLS lo lee de ahí. */
export function rutaFoto(storeId: string, itemId: string, position: number): string {
  return `${storeId}/${itemId}/${position}.jpg`;
}

/** Ruta de la copia HD: junto a la normal, con '-hd' antes de la extensión. */
export function rutaFotoHd(storeId: string, itemId: string, position: number): string {
  return `${storeId}/${itemId}/${position}-hd.jpg`;
}
