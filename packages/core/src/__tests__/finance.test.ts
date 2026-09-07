import { describe, expect, it } from 'vitest';

import { esDelMismoMes, summarizeProfitDays, type ProfitDay } from '../finance/profit.js';

describe('summarizeProfitDays', () => {
  it('suma ingresos, costo y gastos de varios días', () => {
    const dias: ProfitDay[] = [
      { day: '2026-09-01', revenueCents: 10000, costCents: 4000, itemsSold: 2, expensesCents: 1000 },
      { day: '2026-09-02', revenueCents: 5000, costCents: 2000, itemsSold: 1, expensesCents: 500 },
    ];

    const resumen = summarizeProfitDays(dias);

    expect(resumen.revenueCents).toBe(15000);
    expect(resumen.costCents).toBe(6000);
    expect(resumen.expensesCents).toBe(1500);
    expect(resumen.itemsSold).toBe(3);
  });

  it('la ganancia bruta es ingreso menos costo, sin restar los gastos', () => {
    const dias: ProfitDay[] = [
      { day: '2026-09-01', revenueCents: 10000, costCents: 4000, itemsSold: 1, expensesCents: 2000 },
    ];

    expect(summarizeProfitDays(dias).grossProfitCents).toBe(6000);
  });

  it('la ganancia neta también descuenta los gastos (ads)', () => {
    const dias: ProfitDay[] = [
      { day: '2026-09-01', revenueCents: 10000, costCents: 4000, itemsSold: 1, expensesCents: 2000 },
    ];

    expect(summarizeProfitDays(dias).netProfitCents).toBe(4000);
  });

  it('un día sin ventas ni gastos no rompe la suma', () => {
    const dias: ProfitDay[] = [
      { day: '2026-09-01', revenueCents: 0, costCents: 0, itemsSold: 0, expensesCents: 0 },
      { day: '2026-09-02', revenueCents: 3000, costCents: 1000, itemsSold: 1, expensesCents: 0 },
    ];

    const resumen = summarizeProfitDays(dias);
    expect(resumen.netProfitCents).toBe(2000);
  });

  it('sin ningún día, el resumen queda en cero', () => {
    const resumen = summarizeProfitDays([]);
    expect(resumen).toEqual({
      revenueCents: 0,
      costCents: 0,
      expensesCents: 0,
      grossProfitCents: 0,
      netProfitCents: 0,
      itemsSold: 0,
    });
  });

  it('un costo mayor al ingreso deja ganancia negativa (se vendió a pérdida)', () => {
    const dias: ProfitDay[] = [
      { day: '2026-09-01', revenueCents: 3000, costCents: 5000, itemsSold: 1, expensesCents: 0 },
    ];

    expect(summarizeProfitDays(dias).grossProfitCents).toBe(-2000);
  });
});

describe('esDelMismoMes', () => {
  const referencia = new Date('2026-09-07T12:00:00');

  it('un día dentro del mes de referencia es del mismo mes', () => {
    expect(esDelMismoMes('2026-09-01', referencia)).toBe(true);
    expect(esDelMismoMes('2026-09-30', referencia)).toBe(true);
  });

  it('un día de otro mes u otro año no cuenta', () => {
    expect(esDelMismoMes('2026-08-31', referencia)).toBe(false);
    expect(esDelMismoMes('2025-09-07', referencia)).toBe(false);
  });
});
