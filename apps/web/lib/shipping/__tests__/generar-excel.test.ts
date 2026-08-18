import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { EnvioParaExportar } from '@percha/core';

import { escribirLibros } from '../generar-excel';

/**
 * Se prueba contra la plantilla REAL que usa el cliente, no contra una
 * copia simplificada: lo que puede salir mal es justamente que el archivo
 * generado deje de encajar con lo que Shalom espera.
 */
// Relativa a este archivo y no a process.cwd(): así el test funciona igual
// lanzado desde apps/web, desde la raíz del monorepo o desde CI.
const PLANTILLA = join(import.meta.dirname, '..', '..', '..', 'public', 'plantilla-shalom.xlsx');

function cargarPlantilla(): ArrayBuffer {
  const buffer = readFileSync(PLANTILLA);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function envio(cambios: Partial<EnvioParaExportar> = {}): EnvioParaExportar {
  return {
    id: 'e1',
    orderCode: 'PED-000042',
    customerName: 'María Quispe',
    docType: 'DNI',
    docNumber: '70503353',
    phone: '987654321',
    originAgency: 'OVALO DE LA FAMILIA',
    destinyAgency: 'JAEN',
    packageType: 'PAQUETE XS',
    heightCm: 0,
    widthCm: 0,
    lengthCm: 0,
    weightKg: 0,
    packagesCount: 1,
    contactDoc: null,
    contactPhone: null,
    grrNumber: null,
    ...cambios,
  };
}

async function releer(blob: Blob) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await blob.arrayBuffer());
  return libro;
}

describe('generación del Excel de Shalom', () => {
  it('escribe cada envío en su fila, empezando por la 2', async () => {
    const [archivo] = await escribirLibros(cargarPlantilla(), [
      envio({ id: 'a', docNumber: '70503353', destinyAgency: 'JAEN' }),
      envio({ id: 'b', docNumber: '45889210', destinyAgency: 'TRUJILLO', packagesCount: 2 }),
    ]);

    expect(archivo).toBeDefined();
    const hoja = (await releer(archivo!.blob)).getWorksheet('Hoja1')!;

    expect(String(hoja.getRow(2).getCell(1).value)).toBe('70503353');
    expect(String(hoja.getRow(2).getCell(7).value)).toBe('JAEN');
    expect(String(hoja.getRow(3).getCell(1).value)).toBe('45889210');
    expect(String(hoja.getRow(3).getCell(7).value)).toBe('TRUJILLO');
    expect(hoja.getRow(3).getCell(13).value).toBe(2);
  });

  it('conserva el cero inicial del DNI', async () => {
    // Es el error clásico: Excel convierte 07050335 en 7050335 y Shalom
    // rechaza el envío por documento inválido.
    const [archivo] = await escribirLibros(cargarPlantilla(), [envio({ docNumber: '07050335' })]);
    const hoja = (await releer(archivo!.blob)).getWorksheet('Hoja1')!;

    const celda = hoja.getRow(2).getCell(1);
    expect(String(celda.value)).toBe('07050335');
    expect(celda.numFmt).toBe('@');
  });

  it('conserva los encabezados y las hojas de catálogo de la plantilla', async () => {
    const [archivo] = await escribirLibros(cargarPlantilla(), [envio()]);
    const libro = await releer(archivo!.blob);

    expect(libro.worksheets.map((h) => h.name)).toContain('Hoja2');
    const hoja = libro.getWorksheet('Hoja1')!;
    expect(String(hoja.getRow(1).getCell(1).value)).toBe('DESTINATARIO (DOC)');
    expect(String(hoja.getRow(1).getCell(13).value)).toBe('CANTIDAD');
  });

  it('borra las filas de ejemplo que trae la plantilla', async () => {
    // La plantilla viene con ceros precargados hasta la 500. Si no se
    // limpian, Shalom recibiría cientos de envíos fantasma.
    const [archivo] = await escribirLibros(cargarPlantilla(), [envio()]);
    const hoja = (await releer(archivo!.blob)).getWorksheet('Hoja1')!;

    for (const fila of [3, 50, 200, 500]) {
      for (let columna = 1; columna <= 13; columna += 1) {
        expect(hoja.getRow(fila).getCell(columna).value ?? null).toBeNull();
      }
    }
  });

  it('parte en varios archivos cuando pasa de 499 envíos', async () => {
    const muchos = Array.from({ length: 501 }, (_, i) => envio({ id: `e${i}` }));
    const archivos = await escribirLibros(cargarPlantilla(), muchos, new Date('2026-07-28'));

    expect(archivos).toHaveLength(2);
    expect(archivos[0]?.filas).toBe(499);
    expect(archivos[1]?.filas).toBe(2);
    expect(archivos[0]?.nombre).toBe('Shalom-Masivo-2026-07-28-1de2.xlsx');
  });

  it('no genera nada si no hay envíos', async () => {
    expect(await escribirLibros(cargarPlantilla(), [])).toEqual([]);
  });
});
