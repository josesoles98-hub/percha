import Link from 'next/link';

import type { PrendaCalidad, ResumenCalidad } from '@/lib/data/fotos-hd';

export type FiltroHd = 'sin-hd' | 'hd' | 'todas';

const MAX_FILAS = 150;

const FILTROS: Array<{ valor: FiltroHd; etiqueta: string }> = [
  { valor: 'sin-hd', etiqueta: 'Con fotos sin HD' },
  { valor: 'hd', etiqueta: 'Todo en HD' },
  { valor: 'todas', etiqueta: 'Todas' },
];

/**
 * Verificador de fotos HD: cuántas fotos tienen su copia HD (la que se
 * manda a WhatsApp) y de qué prendas faltan.
 */
export function FotosHdPanel({
  prendas,
  resumen,
  filtro,
}: {
  prendas: PrendaCalidad[];
  resumen: ResumenCalidad;
  filtro: FiltroHd;
}) {
  const porcentaje = resumen.fotos > 0 ? Math.round((resumen.enHd / resumen.fotos) * 100) : 0;

  const visibles = prendas.filter((p) => {
    const sin = p.fotos.some((f) => f.calidad === 'sin');
    if (filtro === 'sin-hd') return sin;
    if (filtro === 'hd') return !sin;
    return true;
  });

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-[--radius-card] border border-line bg-surface p-4">
        <p className="text-display tabular-nums">
          {resumen.enHd} <span className="text-title text-muted">de {resumen.fotos} fotos en HD</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-[#25D366]" style={{ width: `${porcentaje}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Dato valor={resumen.enHd} etiqueta="En HD" />
          <Dato valor={resumen.sinHd} etiqueta="Sin HD" />
          <Dato valor={resumen.chicas} etiqueta="Original chico" />
        </div>
        <p className="mt-3 text-caption text-muted">
          {resumen.prendasConFotosSinHd === 0
            ? `Las ${resumen.prendas} prendas tienen todas sus fotos en HD.`
            : `Faltan fotos en HD en ${resumen.prendasConFotosSinHd} de ${resumen.prendas} prendas.`}
        </p>
      </section>

      <section className="rounded-[--radius-card] bg-surface p-4 text-caption text-muted">
        <p className="font-medium text-ink">Cómo poner una foto en HD</p>
        <p className="mt-1">
          Las fotos que dicen <strong className="text-ink">sin HD</strong> se subieron antes de que
          existiera esta función, y la app no guardó sus originales. Entra a la prenda, toca
          Editar, quita la foto y vuelve a subirla desde tu galería: queda en HD.
        </p>
        <p className="mt-1">
          <strong className="text-ink">Original chico</strong> quiere decir que la foto que subiste
          ya era pequeña (por ejemplo, bajada de WhatsApp): subirla otra vez no la mejora.
        </p>
      </section>

      <nav className="flex gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={`/ajustes/fotos-hd?ver=${f.valor}`}
            aria-current={filtro === f.valor ? 'page' : undefined}
            className={`tap rounded-full border px-3 py-1.5 text-caption ${
              filtro === f.valor ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
            }`}
          >
            {f.etiqueta}
          </Link>
        ))}
      </nav>

      {visibles.length === 0 ? (
        <p className="py-8 text-center text-caption text-muted">
          {filtro === 'sin-hd' ? 'No hay prendas con fotos sin HD 🎉' : 'No hay prendas en esta lista.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-[--radius-card] border border-line bg-surface">
            {visibles.slice(0, MAX_FILAS).map((p) => (
              <li key={p.code}>
                <Link href={`/prenda/${p.code}`} className="tap flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 font-medium tabular-nums">{p.code}</span>
                  <span className="flex gap-1.5">
                    {p.fotos.map((f) => (
                      <span
                        key={f.position}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          f.calidad === 'hd'
                            ? 'bg-[#25D366] text-white'
                            : f.calidad === 'chica'
                              ? 'bg-amber-400 text-black'
                              : 'bg-line text-muted'
                        }`}
                      >
                        {f.position} · {f.calidad === 'hd' ? 'HD' : f.calidad === 'chica' ? 'chico' : 'sin HD'}
                      </span>
                    ))}
                  </span>
                  <span className="text-muted" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {visibles.length > MAX_FILAS && (
            <p className="text-center text-caption text-muted">
              Se muestran las {MAX_FILAS} más recientes de {visibles.length}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Dato({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-[--radius-control] bg-bg py-2">
      <p className="text-title tabular-nums">{valor}</p>
      <p className="text-caption text-muted">{etiqueta}</p>
    </div>
  );
}
