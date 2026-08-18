import type { Item, ItemGender, ItemPhoto, ItemStatus, StoreSettings } from '@percha/core';

/**
 * Traducción entre las filas de PostgreSQL (snake_case) y los tipos del
 * dominio (camelCase).
 *
 * Toda fila de la base pasa por aquí. Es lo que permite que `packages/core`
 * no sepa nada de cómo se llaman las columnas: si mañana renombramos una,
 * solo cambia este archivo.
 */

/** Fila cruda de la vista `items_view`. */
export interface ItemRow {
  id: string;
  store_id: string;
  code: string;
  name: string | null;
  description: string | null;
  price_cents: number;
  cost_cents: number | null;
  status: ItemStatus;
  effective_status: ItemStatus;
  brand_id: string | null;
  size_id: string | null;
  category_id: string | null;
  color_id: string | null;
  gender: ItemGender | null;
  reserved_at: string | null;
  reserve_expires_at: string | null;
  reserved_for_name: string | null;
  reserved_for_phone: string | null;
  reserved_deposit_cents: number | null;
  days_left: number | null;
  sold_at: string | null;
  sold_price_cents: number | null;
  share_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  brand_name: string | null;
  size_label: string | null;
  category_name: string | null;
  category_emoji: string | null;
  color_name: string | null;
  color_hex: string | null;
  photos: Array<{
    path: string;
    position: number;
    blurhash: string | null;
    status: ItemPhoto['status'];
  }> | null;
}

export function mapItem(row: ItemRow): Item {
  return {
    id: row.id,
    storeId: row.store_id,
    code: row.code,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    costCents: row.cost_cents,
    status: row.status,
    effectiveStatus: row.effective_status,
    brandId: row.brand_id,
    brandName: row.brand_name,
    sizeId: row.size_id,
    sizeLabel: row.size_label,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryEmoji: row.category_emoji,
    colorId: row.color_id,
    colorName: row.color_name,
    colorHex: row.color_hex,
    gender: row.gender,
    reservedAt: row.reserved_at,
    reserveExpiresAt: row.reserve_expires_at,
    reservedForName: row.reserved_for_name,
    reservedForPhone: row.reserved_for_phone,
    reservedDepositCents: row.reserved_deposit_cents,
    daysLeft: row.days_left,
    soldAt: row.sold_at,
    soldPriceCents: row.sold_price_cents,
    shareCount: row.share_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos: (row.photos ?? []).map((p) => ({
      path: p.path,
      position: p.position,
      blurhash: p.blurhash,
      status: p.status,
    })),
  };
}

export interface StoreRow {
  id: string;
  name: string;
  currency: string;
  currency_symbol: string;
  locale: string;
  timezone: string;
  reserve_days: number;
  code_prefix: string;
  share_template: string;
  share_deposit_cents: number;
  sellers_see_totals: boolean;
}

export function mapStore(row: StoreRow): StoreSettings {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    currencySymbol: row.currency_symbol,
    locale: row.locale,
    timezone: row.timezone,
    reserveDays: row.reserve_days,
    codePrefix: row.code_prefix,
    shareTemplate: row.share_template,
    shareDepositCents: row.share_deposit_cents,
    sellersSeeTotals: row.sellers_see_totals,
  };
}

/** Columnas que pide la app de `items_view`. Una sola definición. */
export const ITEM_COLUMNS = `
  id, store_id, code, name, description, price_cents, cost_cents,
  status, effective_status,
  brand_id, size_id, category_id, color_id, gender,
  reserved_at, reserve_expires_at, reserved_for_name, reserved_for_phone,
  reserved_deposit_cents, days_left,
  sold_at, sold_price_cents, share_count,
  created_by, created_at, updated_at,
  brand_name, size_label, category_name, category_emoji, color_name, color_hex,
  photos
` as const;

export const STORE_COLUMNS = `
  id, name, currency, currency_symbol, locale, timezone,
  reserve_days, code_prefix, share_template, share_deposit_cents, sellers_see_totals
` as const;
