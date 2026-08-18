/**
 * Carga masiva de envíos en Shalom Pro.
 *
 * La especificación está sacada del archivo real del cliente
 * (docs/shalom/plantilla-original.xlsx). Aquí vive solo la parte pura:
 * validar y construir las filas. Escribir el .xlsx encima de la plantilla
 * es cosa de la app, porque depende de la plataforma.
 *
 * Regla de oro: si algo puede hacer que Shalom rechace el archivo, se
 * detecta ANTES de generarlo y se le dice al usuario qué falta y en qué
 * pedido. Subir un archivo y que lo rechacen sin decir por qué es la peor
 * experiencia posible.
 */

export type PackageType =
  | 'SOBRE'
  | 'PAQUETE XXS'
  | 'PAQUETE XS'
  | 'PAQUETE S'
  | 'PAQUETE M'
  | 'PAQUETE L';

/** Los seis valores que acepta la validación de la columna MERCADERIA. */
export const PACKAGE_TYPES: readonly PackageType[] = [
  'SOBRE',
  'PAQUETE XXS',
  'PAQUETE XS',
  'PAQUETE S',
  'PAQUETE M',
  'PAQUETE L',
] as const;

/**
 * La plantilla tiene filas de la 2 a la 500: 499 envíos por archivo.
 * Con más, se reparten en varios archivos.
 */
export const MAX_FILAS_POR_ARCHIVO = 499;

/** Encabezados de la Hoja1, en orden. Sirven para verificar la plantilla. */
export const COLUMNAS = [
  'DESTINATARIO (DOC)',
  'TELF. DESTINATARIO',
  'CONTACTO (DOC)',
  'TELF. CONTACTO',
  'NRO GRR',
  'ORIGEN',
  'DESTINO',
  'MERCADERIA',
  'ALTO',
  'ANCHO',
  'LARGO',
  'PESO',
  'CANTIDAD',
] as const;

export type DocType = 'DNI' | 'RUC' | 'CE';

export interface EnvioParaExportar {
  id: string;
  /** Para poder decirle al usuario en qué pedido está el problema. */
  orderCode: string;
  customerName: string;

  docType: DocType;
  docNumber: string | null;
  phone: string | null;

  /** Nombre EXACTO de la agencia, tal como aparece en el catálogo. */
  originAgency: string | null;
  destinyAgency: string | null;

  packageType: PackageType;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightKg: number;
  packagesCount: number;

  contactDoc: string | null;
  contactPhone: string | null;
  grrNumber: string | null;
}

export interface ProblemaEnvio {
  envioId: string;
  orderCode: string;
  campo: string;
  mensaje: string;
}

/** Una fila del Excel: 13 celdas en el orden de COLUMNAS. */
export type FilaEnvio = (string | number)[];

const LARGO_DOC: Record<DocType, { min: number; max: number; soloDigitos: boolean; nombre: string }> = {
  DNI: { min: 8, max: 8, soloDigitos: true, nombre: 'El DNI' },
  RUC: { min: 11, max: 11, soloDigitos: true, nombre: 'El RUC' },
  CE: { min: 9, max: 12, soloDigitos: false, nombre: 'El carné de extranjería' },
};

/** Quita espacios, guiones y paréntesis de un teléfono. */
export function normalizarTelefono(valor: string): string {
  return valor.replace(/[^\d+]/g, '');
}

export function validarDocumento(docType: DocType, docNumber: string | null): string | null {
  const valor = (docNumber ?? '').trim();
  if (valor === '') return 'falta';

  const regla = LARGO_DOC[docType];
  if (regla.soloDigitos && !/^\d+$/.test(valor)) {
    return `${regla.nombre} solo lleva números`;
  }
  if (!regla.soloDigitos && !/^[a-zA-Z0-9]+$/.test(valor)) {
    return `${regla.nombre} no admite símbolos`;
  }

  if (valor.length < regla.min || valor.length > regla.max) {
    const esperado =
      regla.min === regla.max
        ? `${regla.min} caracteres`
        : `entre ${regla.min} y ${regla.max} caracteres`;
    return `${regla.nombre} tiene ${valor.length} ${
      valor.length === 1 ? 'carácter' : 'caracteres'
    } y debe tener ${esperado}`;
  }

  return null;
}

/**
 * Comprueba los envíos antes de generar nada.
 *
 * Devuelve un problema por cada dato que impediría registrar el envío, con
 * el nombre del cliente y el código del pedido para poder arreglarlo sin
 * tener que buscarlo.
 */
export function validarEnvios(envios: readonly EnvioParaExportar[]): ProblemaEnvio[] {
  const problemas: ProblemaEnvio[] = [];

  const anotar = (envio: EnvioParaExportar, campo: string, mensaje: string) =>
    problemas.push({ envioId: envio.id, orderCode: envio.orderCode, campo, mensaje });

  for (const envio of envios) {
    const quien = envio.customerName.trim() || envio.orderCode;

    const errorDoc = validarDocumento(envio.docType, envio.docNumber);
    if (errorDoc === 'falta') {
      anotar(envio, 'docNumber', `${quien} no tiene ${envio.docType}. Agrégalo para poder enviar.`);
    } else if (errorDoc) {
      anotar(envio, 'docNumber', `${quien}: ${errorDoc}.`);
    }

    const telefono = normalizarTelefono(envio.phone ?? '');
    if (telefono === '') {
      anotar(envio, 'phone', `Falta el teléfono de ${quien}.`);
    } else if (telefono.replace(/\D/g, '').length < 6) {
      anotar(envio, 'phone', `El teléfono de ${quien} parece incompleto.`);
    }

    if (!envio.originAgency) {
      anotar(envio, 'originAgency', 'Configura tu agencia de origen en Ajustes › Envíos.');
    }

    if (!envio.destinyAgency) {
      anotar(envio, 'destinyAgency', `${quien} no tiene agencia de destino.`);
    }

    if (!PACKAGE_TYPES.includes(envio.packageType)) {
      anotar(envio, 'packageType', `Tipo de paquete no válido en ${envio.orderCode}.`);
    }

    if (!Number.isInteger(envio.packagesCount) || envio.packagesCount < 1) {
      anotar(envio, 'packagesCount', `La cantidad de ${envio.orderCode} debe ser 1 o más.`);
    }

    if (envio.contactDoc) {
      const errorContacto = validarDocumento('DNI', envio.contactDoc);
      if (errorContacto && errorContacto !== 'falta') {
        anotar(envio, 'contactDoc', `Documento de contacto de ${quien}: ${errorContacto}.`);
      }
    }
  }

  return problemas;
}

/**
 * Los envíos que pasan la validación, en el orden recibido.
 *
 * Es genérica para no perder el tipo de quien llama: la app trabaja con
 * envíos que además llevan el id del registro en la base, y necesita
 * recuperarlos con ese dato intacto para marcarlos como exportados.
 */
export function enviosValidos<T extends EnvioParaExportar>(
  envios: readonly T[],
): { validos: T[]; problemas: ProblemaEnvio[] } {
  const problemas = validarEnvios(envios);
  const conProblema = new Set(problemas.map((p) => p.envioId));
  return { validos: envios.filter((e) => !conProblema.has(e.id)), problemas };
}

/**
 * Convierte un envío en la fila del Excel.
 *
 * Los documentos y teléfonos van como TEXTO a propósito: un DNI puede
 * empezar por cero y Excel se lo comería si lo tratara como número.
 */
export function construirFila(envio: EnvioParaExportar): FilaEnvio {
  return [
    (envio.docNumber ?? '').trim(),
    normalizarTelefono(envio.phone ?? ''),
    (envio.contactDoc ?? '').trim(),
    normalizarTelefono(envio.contactPhone ?? ''),
    (envio.grrNumber ?? '').trim(),
    envio.originAgency ?? '',
    envio.destinyAgency ?? '',
    envio.packageType,
    envio.heightCm,
    envio.widthCm,
    envio.lengthCm,
    envio.weightKg,
    envio.packagesCount,
  ];
}

export function construirFilas(envios: readonly EnvioParaExportar[]): FilaEnvio[] {
  return envios.map(construirFila);
}

/**
 * Reparte en varios archivos si no caben en uno.
 *
 * Devuelve siempre al menos un grupo cuando hay envíos, para que la
 * interfaz pueda decir «se generarán 2 archivos» antes de descargar nada.
 */
export function repartirEnArchivos<T>(
  envios: readonly T[],
  maximo = MAX_FILAS_POR_ARCHIVO,
): T[][] {
  if (envios.length === 0) return [];

  const grupos: T[][] = [];
  for (let i = 0; i < envios.length; i += maximo) {
    grupos.push(envios.slice(i, i + maximo));
  }
  return grupos;
}

/** Nombre del archivo: reconocible en la carpeta de descargas del móvil. */
export function nombreArchivo(fecha: Date, parte = 1, total = 1): string {
  const iso = fecha.toISOString().slice(0, 10);
  const sufijo = total > 1 ? `-${parte}de${total}` : '';
  return `Shalom-Masivo-${iso}${sufijo}.xlsx`;
}
