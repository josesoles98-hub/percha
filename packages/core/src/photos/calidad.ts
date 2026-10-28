/**
 * Calidad de una foto de prenda según su copia HD.
 *
 * Cada foto tiene una copia "normal" (liviana, para la app) y, en las
 * fotos subidas desde que existe el HD, una segunda copia de hasta ~2048
 * px que se usa al compartir por WhatsApp.
 *
 *  - 'hd'    → hay copia HD con lado largo suficiente.
 *  - 'chica' → hay copia HD, pero el original ya era pequeño (p. ej. una
 *              imagen bajada de WhatsApp): volver a subirla no mejora nada.
 *  - 'sin'   → no hay copia HD (fotos anteriores, o la subida HD falló).
 */

/** Lado largo mínimo, en píxeles, para llamar "HD" a una copia. */
export const LADO_MINIMO_HD = 1600;

export type CalidadFoto = 'hd' | 'chica' | 'sin';

export interface DatosHdFoto {
  hdPath: string | null;
  hdWidth: number | null;
  hdHeight: number | null;
}

export function calidadFoto(foto: DatosHdFoto): CalidadFoto {
  if (!foto.hdPath) return 'sin';

  const lado = Math.max(foto.hdWidth ?? 0, foto.hdHeight ?? 0);
  // Sin medidas (la medición falló al subir) no se puede afirmar que sea
  // chica: se subió una copia HD y se da por buena.
  if (lado === 0) return 'hd';

  return lado >= LADO_MINIMO_HD ? 'hd' : 'chica';
}
