import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExpenseCategory, ProfitDay } from '@percha/core';

/**
 * Panel de ganancias: lo que se vendió, con su costo, y los gastos (ads,
 * otros) del período. Solo la dueña ve esto — ver RLS de `expenses` y de
 * `puedeVerCosto` en PrendaForm.
 */

export interface PrendaVendida {
  code: string;
  name: string | null;
  soldAt: string;
  soldPriceCents: number;
  costCents: number | null;
  /** null cuando la prenda no tiene costo registrado: no se puede saber el margen. */
  marginCents: number | null;
}

export interface Gasto {
  id: string;
  /** 'YYYY-MM-DD' */
  occurredOn: string;
  amountCents: number;
  category: ExpenseCategory;
  note: string | null;
}

export async function listarPrendasVendidas(
  supabase: SupabaseClient,
  storeId: string,
  desde: Date,
): Promise<PrendaVendida[]> {
  const { data } = await supabase
    .from('items_view')
    .select('code, name, sold_at, sold_price_cents, cost_cents')
    .eq('store_id', storeId)
    .eq('effective_status', 'sold')
    .gte('sold_at', desde.toISOString())
    .order('sold_at', { ascending: false });

  return (data ?? []).map((fila) => {
    const soldPriceCents = fila.sold_price_cents ?? 0;
    return {
      code: fila.code as string,
      name: fila.name as string | null,
      soldAt: fila.sold_at as string,
      soldPriceCents,
      costCents: fila.cost_cents,
      marginCents: fila.cost_cents !== null ? soldPriceCents - fila.cost_cents : null,
    };
  });
}

export async function listarGastos(
  supabase: SupabaseClient,
  storeId: string,
  desde: Date,
): Promise<Gasto[]> {
  const { data } = await supabase
    .from('expenses')
    .select('id, occurred_on, amount_cents, category, note')
    .eq('store_id', storeId)
    .gte('occurred_on', fechaISO(desde))
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });

  return (data ?? []).map((fila) => ({
    id: fila.id as string,
    occurredOn: fila.occurred_on as string,
    amountCents: fila.amount_cents as number,
    category: fila.category as ExpenseCategory,
    note: fila.note as string | null,
  }));
}

export async function registrarGasto(
  supabase: SupabaseClient,
  storeId: string,
  gasto: { occurredOn: string; amountCents: number; category: ExpenseCategory; note?: string | null },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      store_id: storeId,
      occurred_on: gasto.occurredOn,
      amount_cents: gasto.amountCents,
      category: gasto.category,
      note: gasto.note?.trim() || null,
    })
    .select('id')
    .single();

  return { id: (data?.id as string | undefined) ?? null, error: error?.message ?? null };
}

export async function borrarGasto(
  supabase: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  return { error: error?.message ?? null };
}

/**
 * Agrupa prendas vendidas y gastos por día, en la zona horaria de la
 * tienda, para los últimos `dias` días (incluyendo hoy).
 *
 * `Intl.DateTimeFormat('en-CA', ...)` es el truco: ese locale devuelve la
 * fecha como 'YYYY-MM-DD' directo, así que sirve de llave sin tener que
 * armar el string a mano ni preocuparse por desfaces de huso horario.
 */
export function agruparPorDia(
  prendas: readonly PrendaVendida[],
  gastos: readonly Gasto[],
  dias: number,
  timezone: string,
): ProfitDay[] {
  const porDia = new Map<string, ProfitDay>();
  const hoy = new Date();

  for (let i = 0; i < dias; i++) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - i);
    const clave = claveDia(fecha, timezone);
    porDia.set(clave, { day: clave, revenueCents: 0, costCents: 0, itemsSold: 0, expensesCents: 0 });
  }

  for (const prenda of prendas) {
    const dia = porDia.get(claveDia(new Date(prenda.soldAt), timezone));
    if (!dia) continue; // vendida antes del rango pedido
    dia.revenueCents += prenda.soldPriceCents;
    dia.costCents += prenda.costCents ?? 0;
    dia.itemsSold += 1;
  }

  for (const gasto of gastos) {
    const dia = porDia.get(gasto.occurredOn);
    if (!dia) continue;
    dia.expensesCents += gasto.amountCents;
  }

  return [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function claveDia(fecha: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(fecha);
}

function fechaISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
