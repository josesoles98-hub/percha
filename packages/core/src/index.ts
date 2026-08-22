/**
 * @percha/core — lógica de negocio compartida.
 *
 * ⚠️ REGLA DEL MONOREPO: este paquete NO importa `react`, `next` ni usa
 * `window`, `document` o `localStorage`. Es lo que permitirá que la app móvil
 * en Expo reutilice todo esto sin reescribir una línea. Si algo necesita el
 * navegador, va en `apps/web`, no aquí.
 *
 * ⚠️ Las re-exportaciones son NOMBRADAS una a una, no `export *`. Turbopack
 * no sigue los barriles con `export *` a través de un paquete del workspace
 * en modo desarrollo: compila bien en producción pero en `next dev` el módulo
 * aparece «sin exportaciones» y todo lo importado llega como undefined.
 * Al enumerarlas, además, el tree-shaking es mejor.
 */

// ── Tipos y constantes del dominio ────────────────────────────────────
export { GENDER_META, ITEM_GENDERS, ITEM_STATUSES, STATUS_META } from './types/index';
export type {
  DashboardStats,
  EventType,
  GenderMeta,
  Item,
  ItemGender,
  ItemPhoto,
  ItemStatus,
  MemberRole,
  PhotoStatus,
  StatusMeta,
  StoreSettings,
} from './types/index';

// ── Formato ───────────────────────────────────────────────────────────
export { formatMoney, parseMoneyToCents } from './format/money';
export type { MoneyFormatOptions } from './format/money';

export {
  formatDateTime,
  formatLongDate,
  formatRelative,
  formatShortDate,
} from './format/date';

// ── Reservas ──────────────────────────────────────────────────────────
export {
  computeExpiry,
  effectiveStatus,
  effectiveStatusFromExpiry,
  getReserveInfo,
  getReserveInfoFromExpiry,
} from './reservations/index';
export type { ReserveInfo, ReserveUrgency } from './reservations/index';

// ── Compartir ─────────────────────────────────────────────────────────
export {
  PLANTILLA_RECOMENDADA,
  SHARE_VARIABLES,
  buildShareText,
  buildShareVars,
  buildWhatsAppUrl,
  renderTemplate,
} from './share/template';
export type { ShareVariable, ShareVars } from './share/template';

// ── Búsqueda ──────────────────────────────────────────────────────────
export { normalizarCodigo, parseSearchQuery } from './search/query';
export type { SearchIntent } from './search/query';

// ── Envíos (Shalom) ───────────────────────────────────────────────────
export {
  COLUMNAS as COLUMNAS_SHALOM,
  MAX_FILAS_POR_ARCHIVO,
  PACKAGE_TYPES,
  construirFila,
  construirFilas,
  enviosValidos,
  explotarPorPaquete,
  nombreArchivo,
  normalizarTelefono,
  repartirEnArchivos,
  validarDocumento,
  validarEnvios,
} from './shipping/shalom';
export type {
  DocType,
  EnvioParaExportar,
  FilaEnvio,
  PackageType,
  ProblemaEnvio,
} from './shipping/shalom';

// ── Exportación ───────────────────────────────────────────────────────
export {
  BOM_UTF8,
  COLUMNAS_INVENTARIO,
  COLUMNAS_PEDIDOS,
  escaparCsv,
  filaCsv,
  inventarioACsv,
  nombreArchivoCsv,
  nombreArchivoCsvPedidos,
  pedidosACsv,
  type PedidoParaCsv,
} from './export/csv';

// ── Validación ────────────────────────────────────────────────────────
export {
  createItemSchema,
  docNumberSchema,
  itemGenderSchema,
  itemStatusSchema,
  reserveItemSchema,
  storeSettingsSchema,
  updateItemSchema,
} from './validation/item';
export type { CreateItemData, CreateItemInput } from './validation/item';
