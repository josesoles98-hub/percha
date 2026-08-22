import {
  COLUMNAS_SHALOM,
  construirFilas,
  explotarPorPaquete,
  nombreArchivo,
  repartirEnArchivos,
  type EnvioParaExportar,
} from '@percha/core';

/**
 * Genera el Excel de carga masiva de Shalom.
 *
 * Se ESCRIBE ENCIMA de la plantilla original en lugar de crear un libro
 * desde cero: así se conservan las validaciones, los desplegables y las
 * hojas de catálogo tal como Shalom las espera. Si algún día cambian la
 * plantilla, se reemplaza el archivo de /public y no hay que tocar código.
 *
 * Vive en la app y no en packages/core porque necesita `fetch` y descargar
 * un archivo, que son cosas del navegador. La parte que de verdad se
 * reutilizaría en la app móvil —validar y construir las filas— sí está en
 * core.
 */

const RUTA_PLANTILLA = '/plantilla-shalom.xlsx';
const HOJA_DATOS = 'Hoja1';
const PRIMERA_FILA_DATOS = 2;

export interface ArchivoGenerado {
  nombre: string;
  blob: Blob;
  filas: number;
  /** IDs de envío (sin repetir) incluidos en este archivo, para marcarlos exportados. */
  envioIds: string[];
}

/**
 * Comprueba que la plantilla sigue siendo la que esperamos.
 *
 * Si Shalom la cambia y nadie se da cuenta, generaríamos archivos con las
 * columnas cruzadas. Es preferible fallar aquí con un mensaje claro.
 */
function verificarEncabezados(hoja: {
  getRow: (n: number) => { getCell: (n: number) => { value: unknown } };
}): void {
  const cabecera = hoja.getRow(1);

  for (const [indice, esperado] of COLUMNAS_SHALOM.entries()) {
    const actual = String(cabecera.getCell(indice + 1).value ?? '').trim();
    if (actual.toUpperCase() !== esperado) {
      throw new Error(
        `La plantilla de Shalom cambió: en la columna ${indice + 1} se esperaba ` +
          `«${esperado}» y hay «${actual}». Descarga la plantilla nueva desde ` +
          'Shalom Pro y reemplaza public/plantilla-shalom.xlsx.',
      );
    }
  }
}

async function cargarPlantilla(): Promise<ArrayBuffer> {
  const respuesta = await fetch(RUTA_PLANTILLA);
  if (!respuesta.ok) {
    throw new Error('No se encontró la plantilla de Shalom en el servidor.');
  }
  return respuesta.arrayBuffer();
}

/**
 * Rellena la plantilla con los envíos.
 *
 * Recibe la plantilla ya cargada en memoria en vez de ir a buscarla, para
 * poder probar esta parte —que es la que puede romper el archivo— sin
 * navegador.
 */
export async function escribirLibros(
  plantilla: ArrayBuffer,
  envios: readonly EnvioParaExportar[],
  fecha: Date = new Date(),
): Promise<ArchivoGenerado[]> {
  if (envios.length === 0) return [];

  // exceljs pesa bastante: se carga solo cuando se va a exportar de verdad,
  // no en el bundle inicial de la app.
  const ExcelJS = (await import('exceljs')).default;

  // Shalom exige un paquete por fila: explota ANTES de repartir en
  // archivos, para que el límite de 499 filas cuente filas reales.
  const grupos = repartirEnArchivos(explotarPorPaquete(envios));
  const archivos: ArchivoGenerado[] = [];

  for (const [indice, grupo] of grupos.entries()) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(plantilla);

    const hoja = libro.getWorksheet(HOJA_DATOS);
    if (!hoja) {
      throw new Error(`La plantilla no tiene la hoja «${HOJA_DATOS}».`);
    }

    verificarEncabezados(hoja);

    const filas = construirFilas(grupo);

    filas.forEach((valores, posicion) => {
      const fila = hoja.getRow(PRIMERA_FILA_DATOS + posicion);
      valores.forEach((valor, columna) => {
        const celda = fila.getCell(columna + 1);
        celda.value = valor;
        // Documentos y teléfonos van como texto: si Excel los interpreta
        // como número, un DNI que empiece por cero pierde el cero.
        if (columna <= 4 && typeof valor === 'string') celda.numFmt = '@';
      });
      fila.commit();
    });

    // La plantilla trae ceros precargados hasta la fila 500. Las filas que
    // sobran se vacían para no mandar envíos fantasma.
    const ultimaUsada = PRIMERA_FILA_DATOS + filas.length - 1;
    for (let n = ultimaUsada + 1; n <= hoja.rowCount; n += 1) {
      const fila = hoja.getRow(n);
      for (let c = 1; c <= COLUMNAS_SHALOM.length; c += 1) fila.getCell(c).value = null;
      fila.commit();
    }

    const buffer = await libro.xlsx.writeBuffer();
    archivos.push({
      nombre: nombreArchivo(fecha, indice + 1, grupos.length),
      blob: new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      filas: filas.length,
      envioIds: [...new Set(grupo.map((e) => e.id))],
    });
  }

  return archivos;
}

/** Descarga la plantilla del servidor y devuelve los archivos listos. */
export async function generarArchivos(
  envios: readonly EnvioParaExportar[],
  fecha: Date = new Date(),
): Promise<ArchivoGenerado[]> {
  if (envios.length === 0) return [];
  return escribirLibros(await cargarPlantilla(), envios, fecha);
}

/** Dispara la descarga en el navegador. */
export function descargar(archivo: ArchivoGenerado): void {
  const url = URL.createObjectURL(archivo.blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = archivo.nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Se revoca con retraso: en Safari, hacerlo de inmediato cancela la
  // descarga que acaba de empezar.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
