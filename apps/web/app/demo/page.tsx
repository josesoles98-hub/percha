/* TEMPORAL — revisar el diseño del buscador sin base de datos. Se borra. */
'use client';

import { Suspense } from 'react';

import { SearchAndFilters } from '@/components/SearchAndFilters';
import type { Catalogos } from '@/lib/data/inventory';
import { filtrosDesdeParams } from '@/lib/filtros-url';

const catalogos: Catalogos = {
  brands: [
    { id: 'b1', name: 'Nike', useCount: 12 },
    { id: 'b2', name: 'Adidas', useCount: 8 },
    { id: 'b3', name: "Levi's", useCount: 5 },
    { id: 'b4', name: 'The North Face', useCount: 3 },
  ],
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((label, i) => ({
    id: `z${i}`,
    label,
    group: 'ropa',
  })),
  categories: [
    { id: 'c1', name: 'Casacas', emoji: '🧥' },
    { id: 'c2', name: 'Polos', emoji: '👕' },
    { id: 'c3', name: 'Jeans', emoji: '👖' },
  ],
  colors: [
    { id: 'k1', name: 'Negro', hex: '#000000' },
    { id: 'k2', name: 'Azul', hex: '#1E40AF' },
    { id: 'k3', name: 'Beige', hex: '#D6C7A1' },
  ],
};

export default function DemoPage() {
  return (
    <Suspense>
      <main className="mx-auto max-w-3xl px-4">
        <SearchAndFilters filtros={filtrosDesdeParams({})} catalogos={catalogos} simbolo="S/" />
        <p className="py-3 text-caption text-muted">128 prendas · S/6,240</p>
        <ul className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li
              key={i}
              className="aspect-3/4 rounded-[--radius-card] border border-line bg-surface"
            />
          ))}
        </ul>
      </main>
    </Suspense>
  );
}
