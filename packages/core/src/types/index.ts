/**
 * Tipos del dominio.
 *
 * Se escriben a mano y NO se generan de la base de datos a propósito: son el
 * contrato entre la lógica de negocio y quien la consuma (web hoy, Expo
 * mañana). Los tipos generados de Supabase viven aparte, en `database.ts`.
 */

export type ItemStatus = 'available' | 'reserved' | 'sold' | 'hidden';

/** Opcional: muchas prendas se venden igual para cualquiera. */
export type ItemGender = 'varon' | 'dama' | 'unisex';

export type MemberRole = 'owner' | 'seller';

export type PhotoStatus = 'pending' | 'ready' | 'failed';

export type EventType =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'reserved'
  | 'reservation_expired'
  | 'reservation_cancelled'
  | 'sold'
  | 'shared'
  | 'photo_added'
  | 'photo_removed'
  | 'duplicated'
  | 'deleted'
  | 'restored';

/** Los cuatro estados, en el orden en que se muestran en los filtros. */
export const ITEM_STATUSES: readonly ItemStatus[] = [
  'available',
  'reserved',
  'sold',
  'hidden',
] as const;

export interface StatusMeta {
  readonly value: ItemStatus;
  readonly label: string;
  readonly emoji: string;
  /** Nombre del token de color; el mapeo real vive en la capa de UI. */
  readonly tone: 'green' | 'yellow' | 'red' | 'gray';
}

export const STATUS_META: Readonly<Record<ItemStatus, StatusMeta>> = {
  available: { value: 'available', label: 'Disponible', emoji: '🟢', tone: 'green' },
  reserved: { value: 'reserved', label: 'Reservada', emoji: '🟡', tone: 'yellow' },
  sold: { value: 'sold', label: 'Vendida', emoji: '🔴', tone: 'red' },
  hidden: { value: 'hidden', label: 'Oculta', emoji: '⚫', tone: 'gray' },
};

/** Los tres géneros, en el orden en que se muestran los chips. */
export const ITEM_GENDERS: readonly ItemGender[] = ['dama', 'varon', 'unisex'] as const;

export interface GenderMeta {
  readonly value: ItemGender;
  readonly label: string;
}

export const GENDER_META: Readonly<Record<ItemGender, GenderMeta>> = {
  dama: { value: 'dama', label: 'Dama' },
  varon: { value: 'varon', label: 'Varón' },
  unisex: { value: 'unisex', label: 'Unisex' },
};

export interface StoreSettings {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
  reserveDays: number;
  codePrefix: string;
  shareTemplate: string;
  shareDepositCents: number;
  sellersSeeTotals: boolean;
}

export interface ItemPhoto {
  path: string;
  position: number;
  blurhash: string | null;
  status: PhotoStatus;
}

/** Corresponde a una fila de la vista `items_view`. */
export interface Item {
  id: string;
  storeId: string;
  code: string;
  name: string | null;
  description: string | null;
  priceCents: number;
  costCents: number | null;

  status: ItemStatus;
  /** Ya corrige las reservas vencidas que el job aún no ha procesado. */
  effectiveStatus: ItemStatus;

  brandId: string | null;
  brandName: string | null;
  sizeId: string | null;
  sizeLabel: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryEmoji: string | null;
  colorId: string | null;
  colorName: string | null;
  colorHex: string | null;
  /** Para varón, dama o unisex; null si no se especificó. */
  gender: ItemGender | null;

  reservedAt: string | null;
  reserveExpiresAt: string | null;
  reservedForName: string | null;
  reservedForPhone: string | null;
  /** Lo que adelantó el cliente en ESTA reserva; null si no se registró. */
  reservedDepositCents: number | null;
  daysLeft: number | null;

  soldAt: string | null;
  soldPriceCents: number | null;

  shareCount: number;
  createdAt: string;
  updatedAt: string;

  photos: ItemPhoto[];
}

export interface DashboardStats {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  hidden: number;
  inventoryValue: number;
  soldValueMonth: number;
  soldValueTotal: number;
  expiringToday: number;
  expired: number;
  addedThisWeek: number;
}
