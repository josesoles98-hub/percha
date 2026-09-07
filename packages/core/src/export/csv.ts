/**
 * Exportación a CSV.
 *
 * Existe para que nunca dependas de que este proyecto siga vivo: tu
 * inventario se baja entero en un archivo que abre cualquier hoja de
 * cálculo. Es la salida de emergencia del producto.
 */

import type { ProfitDay } from '../finance/profit';
import { formatMoney } from '../format/money';
import { GENDER_META, STATUS_META, type Item, type StoreSettings } from '../types/index';

/**
 * Escapa un valor para CSV.
 *
 * Las comas, comillas y saltos de línea rompen el formato si van sueltos, y
 * una descripción de prenda tiene las tres cosas con toda naturalidad.
 */
export function escaparCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';

  const texto = String(valor);
  if (!/[",\n\r;]/.test(texto)) return texto;

  return `"${texto.replace(/"/g, '""')}"`;
}

export function filaCsv(valores: Array<string | number | null | undefined>): string {
  return valores.map(escaparCsv).join(',');
}

export const COLUMNAS_INVENTARIO = [
  'Código',
  'Nombre',
  'Marca',
  'Talla',
  'Categoría',
  'Color',
  'Género',
  'Precio',
  'Estado',
  'Fecha de ingreso',
  'Reservada para',
  'Vence',
  'Fecha de venta',
  'Precio vendido',
  'Descripción',
  'Fotos',
] as const;

const soloFecha = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

/**
 * Convierte el inventario en CSV.
 *
 * Los precios van con el símbolo puesto porque el destino es leerlo, no
 * volver a importarlo: quien lo abra quiere ver «S/50», no «5000».
 */
export function inventarioACsv(items: readonly Item[], store: StoreSettings): string {
  const lineas = [filaCsv([...COLUMNAS_INVENTARIO])];

  for (const item of items) {
    lineas.push(
      filaCsv([
        item.code,
        item.name,
        item.brandName,
        item.sizeLabel,
        item.categoryName,
        item.colorName,
        item.gender ? GENDER_META[item.gender].label : '',
        formatMoney(item.priceCents, { symbol: store.currencySymbol }),
        STATUS_META[item.effectiveStatus].label,
        soloFecha(item.createdAt),
        item.reservedForName,
        soloFecha(item.reserveExpiresAt),
        soloFecha(item.soldAt),
        item.soldPriceCents === null
          ? ''
          : formatMoney(item.soldPriceCents, { symbol: store.currencySymbol }),
        item.description,
        item.photos.length,
      ]),
    );
  }

  // CRLF: es lo que espera Excel, y Numbers y Google Sheets lo aceptan igual.
  return lineas.join('\r\n');
}

export interface PedidoParaCsv {
  code: string;
  statusLabel: string;
  customerName: string;
  prendas: number;
  totalCents: number;
  destinyAgencyName: string | null;
  createdAt: string;
}

export const COLUMNAS_PEDIDOS = [
  'Código',
  'Estado',
  'Cliente',
  'Prendas',
  'Total',
  'Destino',
  'Fecha',
] as const;

/** Convierte la lista de pedidos en CSV, igual que inventarioACsv. */
export function pedidosACsv(pedidos: readonly PedidoParaCsv[], store: StoreSettings): string {
  const lineas = [filaCsv([...COLUMNAS_PEDIDOS])];

  for (const pedido of pedidos) {
    lineas.push(
      filaCsv([
        pedido.code,
        pedido.statusLabel,
        pedido.customerName,
        pedido.prendas,
        formatMoney(pedido.totalCents, { symbol: store.currencySymbol }),
        pedido.destinyAgencyName,
        soloFecha(pedido.createdAt),
      ]),
    );
  }

  return lineas.join('\r\n');
}

export const COLUMNAS_GANANCIAS = [
  'Día',
  'Ingresos',
  'Costo de prendas',
  'Gastos (ads y otros)',
  'Ganancia bruta',
  'Ganancia neta',
  'Prendas vendidas',
] as const;

/**
 * El reporte que suele pedir un banco, una mentoría o un contador: cuánto
 * entró, cuánto costó y cuánto queda, día por día. Ganancia bruta es
 * ingresos − costo; neta le resta además los gastos (ads, etc.) del día.
 */
export function gananciasACsv(dias: readonly ProfitDay[], store: StoreSettings): string {
  const dinero = (cents: number) => formatMoney(cents, { symbol: store.currencySymbol });
  const lineas = [filaCsv([...COLUMNAS_GANANCIAS])];

  for (const dia of dias) {
    const bruta = dia.revenueCents - dia.costCents;
    const neta = bruta - dia.expensesCents;
    lineas.push(
      filaCsv([dia.day, dinero(dia.revenueCents), dinero(dia.costCents), dinero(dia.expensesCents), dinero(bruta), dinero(neta), dia.itemsSold]),
    );
  }

  return lineas.join('\r\n');
}

export function nombreArchivoCsvGanancias(nombreTienda: string, fecha: Date = new Date()): string {
  return `ganancias-${nombreLimpio(nombreTienda) || 'tienda'}-${fecha.toISOString().slice(0, 10)}.csv`;
}

export interface PrendaVendidaParaCsv {
  code: string;
  name: string | null;
  fecha: string;
  soldPriceCents: number;
  costCents: number | null;
  marginCents: number | null;
}

export const COLUMNAS_PRENDAS_VENDIDAS = [
  'Código',
  'Nombre',
  'Fecha de venta',
  'Precio vendido',
  'Costo',
  'Ganancia',
] as const;

/** El detalle prenda por prenda del período que ya se ve en /ganancias. */
export function prendasVendidasACsv(
  prendas: readonly PrendaVendidaParaCsv[],
  store: StoreSettings,
): string {
  const dinero = (cents: number) => formatMoney(cents, { symbol: store.currencySymbol });
  const lineas = [filaCsv([...COLUMNAS_PRENDAS_VENDIDAS])];

  for (const prenda of prendas) {
    lineas.push(
      filaCsv([
        prenda.code,
        prenda.name,
        soloFecha(prenda.fecha),
        dinero(prenda.soldPriceCents),
        prenda.costCents === null ? '' : dinero(prenda.costCents),
        prenda.marginCents === null ? 'sin costo' : dinero(prenda.marginCents),
      ]),
    );
  }

  return lineas.join('\r\n');
}

export function nombreArchivoCsvPrendasVendidas(nombreTienda: string, fecha: Date = new Date()): string {
  return `prendas-vendidas-${nombreLimpio(nombreTienda) || 'tienda'}-${fecha.toISOString().slice(0, 10)}.csv`;
}

function nombreLimpio(nombreTienda: string): string {
  return nombreTienda
    .normalize('NFD')
    // Escapado explícito: el rango de tildes son caracteres combinantes
    // invisibles, y escritos literales cualquier editor los puede comer.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function nombreArchivoCsvPedidos(nombreTienda: string, fecha: Date = new Date()): string {
  return `pedidos-${nombreLimpio(nombreTienda) || 'tienda'}-${fecha.toISOString().slice(0, 10)}.csv`;
}

/**
 * Marca de orden de bytes.
 *
 * Sin ella, Excel en Windows abre el archivo como Latin-1 y «Casaca Niño»
 * se ve como «Casaca NiÃ±o». Tres bytes que evitan que el usuario piense
 * que la exportación está rota.
 */
export const BOM_UTF8 = '﻿';

export function nombreArchivoCsv(nombreTienda: string, fecha: Date = new Date()): string {
  const limpio = nombreLimpio(nombreTienda);

  return `${limpio || 'inventario'}-${fecha.toISOString().slice(0, 10)}.csv`;
}
