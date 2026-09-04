import { describe, expect, it } from 'vitest';

import { formatMoney, parseMoneyToCents } from '../format/money.js';
import {
  computeExpiry,
  effectiveStatus,
  effectiveStatusFromExpiry,
  getReserveInfo,
  getReserveInfoFromExpiry,
} from '../reservations/index.js';
import { buildWhatsAppUrl, renderTemplate } from '../share/template.js';

describe('formatMoney', () => {
  it('omite los decimales cuando el precio es redondo', () => {
    expect(formatMoney(5000)).toBe('S/50');
  });

  it('muestra los decimales solo cuando existen', () => {
    expect(formatMoney(5050)).toBe('S/50.50');
    expect(formatMoney(5005)).toBe('S/50.05');
  });

  it('separa los miles', () => {
    expect(formatMoney(123456)).toBe('S/1,234.56');
  });

  it('respeta el símbolo de la tienda', () => {
    expect(formatMoney(5000, { symbol: '$' })).toBe('$50');
  });
});

describe('parseMoneyToCents', () => {
  it('acepta lo que el usuario teclea de verdad', () => {
    expect(parseMoneyToCents('50')).toBe(5000);
    expect(parseMoneyToCents('S/50')).toBe(5000);
    expect(parseMoneyToCents(' 50.5 ')).toBe(5050);
    expect(parseMoneyToCents('50,50')).toBe(5050);
    expect(parseMoneyToCents('1,234.56')).toBe(123456);
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
  });

  it('distingue vacío de cero', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('   ')).toBeNull();
    expect(parseMoneyToCents('0')).toBe(0);
  });

  it('no pierde precisión en importes con céntimos', () => {
    // El clásico 19.99 * 100 = 1998.9999... en coma flotante
    expect(parseMoneyToCents('19.99')).toBe(1999);
  });
});

describe('reservas', () => {
  const reservedAt = new Date('2026-07-22T14:30:00Z');

  it('congela el vencimiento con los días indicados', () => {
    expect(computeExpiry(reservedAt, 5).toISOString()).toBe('2026-07-27T14:30:00.000Z');
  });

  it('cambiar el ajuste no altera una reserva ya creada', () => {
    // La reserva se creó con 5 días; que hoy el ajuste sea 7 es irrelevante.
    const info = getReserveInfo(reservedAt, 5, new Date('2026-07-26T14:30:00Z'));
    expect(info?.daysLeft).toBe(1);
    expect(info?.label).toBe('Vence mañana');
  });

  it('marca la urgencia por tramos', () => {
    const at = (iso: string) => getReserveInfo(reservedAt, 5, new Date(iso));
    expect(at('2026-07-23T14:30:00Z')?.urgency).toBe('normal');
    expect(at('2026-07-25T14:30:00Z')?.urgency).toBe('soon');
    expect(at('2026-07-27T08:30:00Z')?.urgency).toBe('today');
    expect(at('2026-07-28T14:30:00Z')?.urgency).toBe('expired');
  });

  it('nunca devuelve días negativos', () => {
    const info = getReserveInfo(reservedAt, 5, new Date('2026-09-01T00:00:00Z'));
    expect(info?.daysLeft).toBe(0);
    expect(info?.expired).toBe(true);
  });

  it('parte del vencimiento que da la base de datos', () => {
    // Regresión: la interfaz calculaba el contador con los días
    // configurados AHORA en vez de con los que se congelaron al reservar.
    // Tras cambiar el ajuste de 5 a 10 días, la pantalla le prometía al
    // cliente una fecha que la base de datos no iba a respetar.
    const vencimientoReal = computeExpiry(reservedAt, 5); // se reservó con 5
    const ahora = new Date('2026-07-26T14:30:00Z');

    const desdeLaBase = getReserveInfoFromExpiry(vencimientoReal, ahora);
    expect(desdeLaBase?.daysLeft).toBe(1);
    expect(desdeLaBase?.label).toBe('Vence mañana');

    // Lo que se veía antes al haber cambiado el ajuste a 10 días:
    const recalculadoMal = getReserveInfo(reservedAt, 10, ahora);
    expect(recalculadoMal?.daysLeft).toBe(6);
    expect(desdeLaBase?.daysLeft).not.toBe(recalculadoMal?.daysLeft);
  });

  it('acepta el vencimiento como cadena ISO, que es como llega de la base', () => {
    const info = getReserveInfoFromExpiry(
      '2026-07-27T14:30:00Z',
      new Date('2026-07-25T14:30:00Z'),
    );
    expect(info?.daysLeft).toBe(2);
    expect(info?.expired).toBe(false);
  });

  it('sin vencimiento no hay reserva que mostrar', () => {
    expect(getReserveInfoFromExpiry(null)).toBeNull();
    expect(getReserveInfoFromExpiry('fecha invalida')).toBeNull();
  });

  it('el estado efectivo desde el vencimiento coincide con el de la base', () => {
    const vencido = '2026-07-01T00:00:00Z';
    expect(effectiveStatusFromExpiry('reserved', vencido, new Date('2026-07-30T00:00:00Z')))
      .toBe('available');
    expect(effectiveStatusFromExpiry('reserved', '2026-08-30T00:00:00Z', new Date('2026-07-30T00:00:00Z')))
      .toBe('reserved');
    expect(effectiveStatusFromExpiry('sold', null)).toBe('sold');
  });

  it('una reserva vencida ya cuenta como disponible', () => {
    expect(effectiveStatus('reserved', reservedAt, 5, new Date('2026-07-30T00:00:00Z')))
      .toBe('available');
    expect(effectiveStatus('reserved', reservedAt, 5, new Date('2026-07-24T00:00:00Z')))
      .toBe('reserved');
    expect(effectiveStatus('sold', null, null)).toBe('sold');
  });
});

describe('plantilla de compartir', () => {
  const template = [
    '🔥 NUEVO INGRESO 🔥',
    '',
    'Marca: {{marca}}',
    'Talla: {{talla}}',
    'Precio: {{precio}}',
    '',
    'Reserva desde {{adelanto}}.',
  ].join('\n');

  it('rellena todas las variables', () => {
    const out = renderTemplate(template, {
      marca: 'Nike',
      talla: 'L',
      precio: 'S/50',
      adelanto: 'S/10',
    });
    expect(out).toContain('Marca: Nike');
    expect(out).toContain('Talla: L');
    expect(out).toContain('Reserva desde S/10.');
  });

  it('BORRA la línea entera si la variable viene vacía', () => {
    // Esto es lo que evita enviar "Marca: " suelto a un grupo de clientes.
    const out = renderTemplate(template, {
      marca: null,
      talla: 'L',
      precio: 'S/50',
      adelanto: 'S/10',
    });
    expect(out).not.toContain('Marca');
    expect(out).toContain('Talla: L');
  });

  it('no deja huecos dobles al borrar líneas', () => {
    const out = renderTemplate(template, { precio: 'S/50', adelanto: 'S/10' });
    expect(out).not.toMatch(/\n{3,}/);
    expect(out.startsWith('🔥')).toBe(true);
    expect(out.endsWith('.')).toBe(true);
  });

  it('conserva el texto fijo aunque no haya ninguna variable', () => {
    expect(renderTemplate('Solo una unidad.', {})).toBe('Solo una unidad.');
  });
});

describe('buildWhatsAppUrl', () => {
  it('agrega el 51 a un celular peruano guardado sin código de país', () => {
    expect(buildWhatsAppUrl('hola', '958575851')).toBe('https://wa.me/51958575851?text=hola');
  });

  it('no duplica el 51 si el número ya lo trae', () => {
    expect(buildWhatsAppUrl('hola', '51958575851')).toBe('https://wa.me/51958575851?text=hola');
  });

  it('limpia guiones y espacios antes de revisar el código de país', () => {
    expect(buildWhatsAppUrl('hola', '958-575-851')).toBe('https://wa.me/51958575851?text=hola');
  });

  it('sin teléfono, deja el link genérico de wa.me', () => {
    expect(buildWhatsAppUrl('hola')).toBe('https://wa.me/?text=hola');
  });
});
