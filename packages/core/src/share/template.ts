/**
 * Motor de la plantilla de WhatsApp.
 *
 * Sustituye las variables {{...}} de la plantilla configurada en Ajustes.
 *
 * Regla clave: si una línea contiene una variable vacía y no aporta nada más,
 * la línea DESAPARECE. Sin esto, una prenda sin marca generaría un mensaje con
 * "Marca: " suelto, y eso se envía a un grupo de clientes reales.
 */

import { formatMoney } from '../format/money';
import { GENDER_META, STATUS_META, type Item, type StoreSettings } from '../types/index';

/**
 * El mensaje recomendado: marca, talla y precio.
 *
 * Es lo que el cliente necesita para decidir, y en WhatsApp va debajo de las
 * fotos — cada línea de más empuja el precio fuera de la vista. Se puede
 * ampliar desde Ajustes › Compartir.
 *
 * Debe coincidir con el `default` de `stores.share_template` en la
 * migración que lo cambió por última vez (buscar "share_template" en
 * supabase/migrations). Hay un test que lo comprueba leyendo el SQL, para
 * que no se desincronicen.
 */
export const PLANTILLA_RECOMENDADA = 'Marca: {{marca}}\nTalla: {{talla}}\nPrecio: {{precio}}';

/** Variables que acepta la plantilla, para documentarlas en Ajustes. */
export const SHARE_VARIABLES = [
  { key: 'marca', label: 'Marca', example: 'Nike' },
  { key: 'talla', label: 'Talla', example: 'L' },
  { key: 'precio', label: 'Precio', example: 'S/50' },
  { key: 'estado', label: 'Estado', example: 'Disponible' },
  { key: 'codigo', label: 'Código', example: 'PR-000128' },
  { key: 'nombre', label: 'Nombre de la prenda', example: 'Casaca cortavientos' },
  { key: 'descripcion', label: 'Descripción', example: 'Sin detalles' },
  { key: 'categoria', label: 'Categoría', example: 'Casacas' },
  { key: 'color', label: 'Color', example: 'Negro' },
  { key: 'genero', label: 'Para quién', example: 'Dama' },
  { key: 'adelanto', label: 'Monto de reserva', example: 'S/10' },
  { key: 'tienda', label: 'Nombre de la tienda', example: 'Ropa Americana JS' },
] as const;

export type ShareVariable = (typeof SHARE_VARIABLES)[number]['key'];

export type ShareVars = Partial<Record<ShareVariable, string | null | undefined>>;

const VARIABLE_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/**
 * Rellena la plantilla y limpia lo que quede vacío.
 */
export function renderTemplate(template: string, vars: ShareVars): string {
  const lines = template.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    VARIABLE_RE.lastIndex = 0;
    const hasVariables = VARIABLE_RE.test(line);

    if (!hasVariables) {
      kept.push(line);
      continue;
    }

    let anyFilled = false;
    let allEmpty = true;

    VARIABLE_RE.lastIndex = 0;
    const rendered = line.replace(VARIABLE_RE, (_match, rawKey: string) => {
      const value = vars[rawKey as ShareVariable];
      const text = value == null ? '' : String(value).trim();
      if (text !== '') {
        anyFilled = true;
        allEmpty = false;
      }
      return text;
    });

    // La línea tenía variables y todas vinieron vacías → se descarta entera,
    // para no dejar "Marca: " colgando.
    if (allEmpty && !anyFilled) continue;

    kept.push(rendered);
  }

  // Colapsa los huecos que deja el borrado de líneas: nunca más de una línea
  // en blanco seguida, y sin blancos al principio ni al final.
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Construye las variables a partir de una prenda y los ajustes de la tienda.
 */
export function buildShareVars(item: Item, store: StoreSettings): ShareVars {
  const money = (cents: number) => formatMoney(cents, { symbol: store.currencySymbol });

  return {
    marca: item.brandName,
    talla: item.sizeLabel,
    precio: money(item.priceCents),
    estado: STATUS_META[item.effectiveStatus].label,
    codigo: item.code,
    nombre: item.name,
    descripcion: item.description,
    categoria: item.categoryName,
    color: item.colorName,
    genero: item.gender ? GENDER_META[item.gender].label : null,
    adelanto: money(store.shareDepositCents),
    tienda: store.name,
  };
}

/** Atajo: prenda + ajustes → mensaje listo para enviar. */
export function buildShareText(item: Item, store: StoreSettings): string {
  return renderTemplate(store.shareTemplate, buildShareVars(item, store));
}

/**
 * Enlace de respaldo a WhatsApp con el texto ya cargado.
 *
 * Se usa cuando no se pueden compartir archivos (escritorio) o cuando el
 * usuario elige "solo texto". Con fotos, WhatsApp en iOS a veces descarta el
 * texto del share sheet; por eso la app además copia el mensaje al
 * portapapeles. Ver sección 4.3 del documento de diseño.
 */
/**
 * wa.me exige el número completo CON código de país — sin él, el link
 * abre pero WhatsApp no encuentra a nadie y muestra "No se pudo abrir
 * este enlace". Los celulares peruanos se guardan a 9 dígitos (el
 * formato que se pide al escribirlos), así que si no trae ya el 51
 * adelante se lo agrega acá, no al guardar el dato.
 */
function conCodigoDePais(digitos: string): string {
  if (digitos.length === 9 && digitos.startsWith('9')) return `51${digitos}`;
  return digitos;
}

export function buildWhatsAppUrl(text: string, phone?: string): string {
  const base = phone
    ? `https://wa.me/${conCodigoDePais(phone.replace(/\D/g, ''))}`
    : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}
