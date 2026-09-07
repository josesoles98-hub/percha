import { describe, expect, it } from 'vitest';

import {
  BOM_UTF8,
  COLUMNAS_INVENTARIO,
  escaparCsv,
  filaCsv,
  gananciasACsv,
  inventarioACsv,
  nombreArchivoCsv,
  prendasVendidasACsv,
} from '../export/csv';
import type { ProfitDay } from '../finance/profit';
import type { Item, StoreSettings } from '../types/index';

const tienda: StoreSettings = {
  id: 's1',
  name: 'Ropa Americana JS',
  currency: 'PEN',
  currencySymbol: 'S/',
  locale: 'es-PE',
  timezone: 'America/Lima',
  reserveDays: 5,
  codePrefix: 'PR',
  shareTemplate: '',
  shareDepositCents: 1000,
  sellersSeeTotals: true,
};

function prenda(cambios: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    storeId: 's1',
    code: 'PR-000128',
    name: 'Casaca cortavientos',
    description: null,
    priceCents: 5000,
    costCents: null,
    status: 'available',
    effectiveStatus: 'available',
    brandId: null,
    brandName: 'Nike',
    sizeId: null,
    sizeLabel: 'L',
    categoryId: null,
    categoryName: 'Casacas',
    categoryEmoji: '🧥',
    colorId: null,
    colorName: 'Negro',
    colorHex: null,
    gender: null,
    reservedAt: null,
    reserveExpiresAt: null,
    reservedForName: null,
    reservedForPhone: null,
    reservedDepositCents: null,
    daysLeft: null,
    customerId: null,
    soldAt: null,
    soldPriceCents: null,
    shareCount: 0,
    createdAt: '2026-07-22T14:30:00.000Z',
    updatedAt: '2026-07-22T14:30:00.000Z',
    photos: [],
    ...cambios,
  };
}

describe('escaparCsv', () => {
  it('deja en paz lo que no necesita comillas', () => {
    expect(escaparCsv('Nike')).toBe('Nike');
    expect(escaparCsv(5000)).toBe('5000');
  });

  it('entrecomilla cuando hay una coma', () => {
    // Sin esto, «Casaca negra, talla L» se partiría en dos columnas y
    // desplazaría toda la fila.
    expect(escaparCsv('Casaca negra, talla L')).toBe('"Casaca negra, talla L"');
  });

  it('duplica las comillas internas', () => {
    expect(escaparCsv('Casaca "vintage"')).toBe('"Casaca ""vintage"""');
  });

  it('entrecomilla los saltos de línea', () => {
    expect(escaparCsv('Linea 1\nLinea 2')).toBe('"Linea 1\nLinea 2"');
  });

  it('entrecomilla el punto y coma, que Excel en español usa de separador', () => {
    expect(escaparCsv('a;b')).toBe('"a;b"');
  });

  it('convierte los vacíos en celda vacía, no en «null»', () => {
    expect(escaparCsv(null)).toBe('');
    expect(escaparCsv(undefined)).toBe('');
  });
});

describe('filaCsv', () => {
  it('une los valores con comas', () => {
    expect(filaCsv(['PR-1', 'Nike', 5000])).toBe('PR-1,Nike,5000');
  });

  it('mantiene el hueco de las celdas vacías', () => {
    // Si se colapsaran, las columnas siguientes se correrían de sitio.
    expect(filaCsv(['a', null, 'c'])).toBe('a,,c');
  });
});

describe('inventarioACsv', () => {
  it('pone los encabezados primero', () => {
    const csv = inventarioACsv([], tienda);
    expect(csv.split('\r\n')[0]).toBe(COLUMNAS_INVENTARIO.join(','));
  });

  it('escribe una fila por prenda con el precio formateado', () => {
    const csv = inventarioACsv([prenda()], tienda);
    const filas = csv.split('\r\n');

    expect(filas).toHaveLength(2);
    expect(filas[1]).toContain('PR-000128');
    expect(filas[1]).toContain('S/50');
    expect(filas[1]).toContain('Disponible');
  });

  it('usa el estado efectivo, no el crudo de la base', () => {
    // Una reserva vencida se exporta como disponible, igual que se ve en
    // la app.
    const csv = inventarioACsv(
      [prenda({ status: 'reserved', effectiveStatus: 'available' })],
      tienda,
    );

    // Se mira solo la fila de datos: la cabecera tiene una columna que se
    // llama «Reservada para» y haría pasar la comprobación por el motivo
    // equivocado.
    const datos = csv.split('\r\n')[1] ?? '';
    expect(datos).toContain('Disponible');
    expect(datos).not.toContain('Reservada');
  });

  it('recorta las fechas al día', () => {
    const csv = inventarioACsv([prenda()], tienda);
    expect(csv).toContain('2026-07-22');
    expect(csv).not.toContain('14:30');
  });

  it('sobrevive a una descripción con comas, comillas y saltos', () => {
    const csv = inventarioACsv(
      [prenda({ description: 'Estado 9/10, sin "detalles".\nMide 60cm.' })],
      tienda,
    );

    // La fila se mantiene entera: el salto va dentro de comillas.
    expect(csv).toContain('"Estado 9/10, sin ""detalles"".\nMide 60cm."');
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('cuenta las fotos', () => {
    const csv = inventarioACsv(
      [
        prenda({
          photos: [
            { path: 'a.jpg', position: 1, blurhash: null, status: 'ready' },
            { path: 'b.jpg', position: 2, blurhash: null, status: 'ready' },
          ],
        }),
      ],
      tienda,
    );
    expect(csv.trim().endsWith(',2')).toBe(true);
  });
});

describe('nombreArchivoCsv', () => {
  it('lleva el nombre de la tienda y la fecha', () => {
    expect(nombreArchivoCsv('Ropa Americana JS', new Date('2026-07-28T10:00:00Z'))).toBe(
      'Ropa-Americana-JS-2026-07-28.csv',
    );
  });

  it('quita tildes y eñes, que rompen la descarga en algunos navegadores', () => {
    expect(nombreArchivoCsv('Moda Ñuñoa Piñón', new Date('2026-07-28T10:00:00Z'))).toBe(
      'Moda-Nunoa-Pinon-2026-07-28.csv',
    );
  });

  it('no deja guiones colgando al principio ni al final', () => {
    expect(nombreArchivoCsv('!! Tienda !!', new Date('2026-07-28T10:00:00Z'))).toBe(
      'Tienda-2026-07-28.csv',
    );
  });

  it('tiene un nombre de reserva si la tienda no deja nada usable', () => {
    expect(nombreArchivoCsv('!!!', new Date('2026-07-28T10:00:00Z'))).toBe(
      'inventario-2026-07-28.csv',
    );
  });
});

describe('BOM', () => {
  it('es la marca que hace que Excel lea bien las tildes', () => {
    expect(BOM_UTF8).toBe('﻿');
    expect(BOM_UTF8).toHaveLength(1);
  });
});

describe('gananciasACsv', () => {
  const dias: ProfitDay[] = [
    { day: '2026-09-06', revenueCents: 10000, costCents: 4000, itemsSold: 2, expensesCents: 1000 },
    { day: '2026-09-07', revenueCents: 0, costCents: 0, itemsSold: 0, expensesCents: 0 },
  ];

  it('calcula ganancia bruta y neta por día, con el símbolo de la tienda', () => {
    const csv = gananciasACsv(dias, tienda);
    const filas = csv.split('\r\n');

    expect(filas[0]).toBe('Día,Ingresos,Costo de prendas,Gastos (ads y otros),Ganancia bruta,Ganancia neta,Prendas vendidas');
    // bruta = 10000 - 4000 = 6000 (S/60); neta = 6000 - 1000 = 5000 (S/50)
    expect(filas[1]).toBe('2026-09-06,S/100,S/40,S/10,S/60,S/50,2');
  });

  it('un día sin ventas ni gastos igual sale en el reporte, en cero', () => {
    const csv = gananciasACsv(dias, tienda);
    expect(csv).toContain('2026-09-07,S/0,S/0,S/0,S/0,S/0,0');
  });
});

describe('prendasVendidasACsv', () => {
  it('marca "sin costo" en vez de inventar una ganancia que no se puede calcular', () => {
    const csv = prendasVendidasACsv(
      [
        {
          code: 'PR-000001',
          name: 'Casaca',
          fecha: '2026-09-06T15:00:00.000Z',
          soldPriceCents: 8000,
          costCents: null,
          marginCents: null,
        },
      ],
      tienda,
    );

    expect(csv).toContain('PR-000001,Casaca,2026-09-06,S/80,,sin costo');
  });

  it('con costo registrado, calcula la ganancia de esa prenda', () => {
    const csv = prendasVendidasACsv(
      [
        {
          code: 'PR-000002',
          name: 'Jean',
          fecha: '2026-09-05T15:00:00.000Z',
          soldPriceCents: 6000,
          costCents: 2000,
          marginCents: 4000,
        },
      ],
      tienda,
    );

    expect(csv).toContain('PR-000002,Jean,2026-09-05,S/60,S/20,S/40');
  });
});
