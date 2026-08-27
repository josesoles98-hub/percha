/**
 * Lee una boleta/guía de Shalom en PDF y saca los tres datos que
 * importan: el DNI del destinatario (para saber de quién es, sin tener
 * que reconocerlo a mano), el número de orden y el código de seguridad
 * (la "clave" que el cliente necesita para recoger su paquete).
 *
 * El worker de pdfjs se sirve como archivo estático desde /public en vez
 * de importarlo — así no depende de que el empaquetador (Turbopack/
 * webpack) sepa resolver el import especial que pdfjs espera.
 */

export interface DatosBoleta {
  dni: string | null;
  orden: string | null;
  codigo: string | null;
}

async function extraerTexto(archivo: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const datos = await archivo.arrayBuffer();
  const documento = await pdfjsLib.getDocument({ data: datos }).promise;

  let texto = '';
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const contenido = await pagina.getTextContent();
    texto += contenido.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  return texto;
}

/**
 * El DNI aparece dos veces en la boleta (remitente y destinatario). Se
 * busca desde "DATOS DEL DESTINATARIO" en adelante para no confundir uno
 * con el otro.
 *
 * "NRO. ORDEN" y "CÓDIGO" salen de una tabla: en el texto extraído las
 * DOS etiquetas van primero y los DOS valores después ("NRO. ORDEN:
 * CÓDIGO: 92670108 WKKW"), no "etiqueta: valor" pegados como en el resto
 * de la boleta — por eso van en un solo patrón.
 */
export function extraerCampos(textoCrudo: string): DatosBoleta {
  const texto = textoCrudo.replace(/\s+/g, ' ');

  const ordenYCodigo = texto.match(/NRO\.?\s*ORDEN:?\s*C[ÓO]DIGO:?\s*(\d+)\s+([A-Z0-9]{3,10})/i);
  const orden = ordenYCodigo?.[1] ?? null;
  const codigo = ordenYCodigo?.[2] ?? null;

  // Algunas boletas dicen "DNI/RUC:" y otras solo "DNI:" — el "/RUC" es
  // opcional para que ambas calcen.
  const desdeDestinatario = texto.search(/DATOS\s+DEL\s+DESTINATARIO/i);
  const bloque = desdeDestinatario >= 0 ? texto.slice(desdeDestinatario) : texto;
  const dni = bloque.match(/DNI(?:\/?\s*RUC)?:?\s*(\d{8,11})/i)?.[1] ?? null;

  return { dni, orden, codigo };
}

export async function leerBoletaShalom(archivo: File): Promise<DatosBoleta> {
  const texto = await extraerTexto(archivo);
  return extraerCampos(texto);
}

/** El texto que se guarda como "código de seguimiento" del envío. */
export function formatearCodigoSeguimiento(datos: DatosBoleta): string | null {
  if (!datos.codigo) return null;
  return datos.orden ? `${datos.codigo} (guía ${datos.orden})` : datos.codigo;
}
