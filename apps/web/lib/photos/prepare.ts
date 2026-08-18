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

export interface FotoPreparada {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  /** URL local para la vista previa inmediata. Hay que revocarla al soltar. */
  previewUrl: string;
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
 * Convierte y comprime. Se ejecuta en un Web Worker cuando el navegador lo
 * permite, para que el hilo principal siga respondiendo mientras el usuario
 * teclea el precio.
 */
export async function prepararFoto(file: File): Promise<FotoPreparada> {
  let origen: Blob = file;

  if (esHeic(file)) {
    origen = await convertirHeic(file);
  }

  const { default: comprimir } = await import('browser-image-compression');
  const archivoJpeg = new File([origen], file.name.replace(/\.\w+$/, '.jpg'), {
    type: 'image/jpeg',
  });
  const opciones = {
    maxSizeMB: OBJETIVO_MB,
    maxWidthOrHeight: MAX_LADO,
    initialQuality: CALIDAD,
    fileType: 'image/jpeg',
  };

  let comprimida: Blob;
  try {
    comprimida = await comprimir(archivoJpeg, { ...opciones, useWebWorker: true });
  } catch {
    // El Web Worker de la librería puede fallar en un contexto no seguro
    // (probando por la IP de la red local en vez de https o localhost).
    // Sin este respaldo, una prenda se guardaba sin foto y sin ningún aviso.
    comprimida = await comprimir(archivoJpeg, { ...opciones, useWebWorker: false });
  }

  const { width, height } = await medir(comprimida);

  return {
    blob: comprimida,
    width,
    height,
    bytes: comprimida.size,
    previewUrl: URL.createObjectURL(comprimida),
  };
}

/** Ruta en Storage. El store_id va primero porque la política RLS lo lee de ahí. */
export function rutaFoto(storeId: string, itemId: string, position: number): string {
  return `${storeId}/${itemId}/${position}.jpg`;
}
