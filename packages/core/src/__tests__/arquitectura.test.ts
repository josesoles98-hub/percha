import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * La regla del monorepo, verificada en vez de confiada.
 *
 * `packages/core` no puede depender de React ni del navegador: es lo que
 * permitirá que la app móvil en Expo reutilice toda la lógica de negocio sin
 * reescribir una línea. Es fácil romperla sin darse cuenta (un `localStorage`
 * aquí, un `window` allá) y no se nota hasta que ya hay medio paquete atado
 * al DOM, así que se comprueba automáticamente.
 */

const RAIZ = join(import.meta.dirname, '..');

const PAQUETES_PROHIBIDOS = ['react', 'react-dom', 'next', 'next/'];
const GLOBALES_PROHIBIDAS = ['window', 'document', 'localStorage', 'sessionStorage', 'navigator'];

function archivosFuente(directorio: string): string[] {
  const encontrados: string[] = [];

  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada);

    if (statSync(ruta).isDirectory()) {
      if (entrada === '__tests__') continue; // los tests sí pueden usar node
      encontrados.push(...archivosFuente(ruta));
    } else if (entrada.endsWith('.ts') && !entrada.endsWith('.d.ts')) {
      encontrados.push(ruta);
    }
  }

  return encontrados;
}

describe('packages/core se mantiene independiente de la interfaz', () => {
  const archivos = archivosFuente(RAIZ);

  it('encuentra los archivos que tiene que revisar', () => {
    expect(archivos.length).toBeGreaterThan(5);
  });

  it('no importa React ni Next', () => {
    const culpables: string[] = [];

    for (const ruta of archivos) {
      const contenido = readFileSync(ruta, 'utf8');
      const importes = [...contenido.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

      for (const importado of importes) {
        if (PAQUETES_PROHIBIDOS.some((p) => importado === p || importado.startsWith(`${p}/`))) {
          culpables.push(`${ruta.replace(RAIZ, 'src')} → ${importado}`);
        }
      }
    }

    expect(culpables).toEqual([]);
  });

  it('no usa globales del navegador', () => {
    const culpables: string[] = [];

    for (const ruta of archivos) {
      const contenido = readFileSync(ruta, 'utf8');
      // Sin comentarios: mencionar `window` al explicar algo es legítimo.
      const codigo = contenido
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      for (const global of GLOBALES_PROHIBIDAS) {
        if (new RegExp(`\\b${global}\\s*\\.`).test(codigo)) {
          culpables.push(`${ruta.replace(RAIZ, 'src')} → ${global}`);
        }
      }
    }

    expect(culpables).toEqual([]);
  });
});
