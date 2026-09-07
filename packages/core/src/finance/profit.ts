/**
 * Panel de ganancias: ingreso, costo y gastos por día.
 *
 * La agregación por día (agrupar ventas y gastos por fecha) se hace en el
 * servidor (`apps/web`), no aquí — mismo criterio que ya se usa en el resto
 * del panel: el volumen de ventas de la tienda no justifica una función SQL
 * nueva. Lo que sí vive en `packages/core` es la suma pura de un rango de
 * días ya agregados, para poder probarla sin tocar la base de datos.
 */

export type ExpenseCategory = 'ads' | 'otro';

/** Ingresos, costo de mercadería y gastos de UN día. Ya viene sumado por día. */
export interface ProfitDay {
  /** 'YYYY-MM-DD', en la zona horaria de la tienda. */
  day: string;
  revenueCents: number;
  costCents: number;
  itemsSold: number;
  expensesCents: number;
}

export interface ProfitSummary {
  revenueCents: number;
  costCents: number;
  expensesCents: number;
  /** Ingreso − costo de la prenda vendida. No descuenta gastos como ads. */
  grossProfitCents: number;
  /** Ganancia bruta − gastos: lo que de verdad queda en el bolsillo. */
  netProfitCents: number;
  itemsSold: number;
}

/** Suma un rango de días ya agregados en un solo resumen. */
export function summarizeProfitDays(days: readonly ProfitDay[]): ProfitSummary {
  const inicio: ProfitSummary = {
    revenueCents: 0,
    costCents: 0,
    expensesCents: 0,
    grossProfitCents: 0,
    netProfitCents: 0,
    itemsSold: 0,
  };

  return days.reduce((acumulado, dia) => {
    const grossDia = dia.revenueCents - dia.costCents;
    return {
      revenueCents: acumulado.revenueCents + dia.revenueCents,
      costCents: acumulado.costCents + dia.costCents,
      expensesCents: acumulado.expensesCents + dia.expensesCents,
      grossProfitCents: acumulado.grossProfitCents + grossDia,
      netProfitCents: acumulado.netProfitCents + (grossDia - dia.expensesCents),
      itemsSold: acumulado.itemsSold + dia.itemsSold,
    };
  }, inicio);
}

/** ¿El día ('YYYY-MM-DD') cae en el mes de `referencia`? Para filtrar "este mes". */
export function esDelMismoMes(day: string, referencia: Date = new Date()): boolean {
  const [anio, mes] = day.split('-').map(Number);
  return anio === referencia.getFullYear() && mes === referencia.getMonth() + 1;
}
