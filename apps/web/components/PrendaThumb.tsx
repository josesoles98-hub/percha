/**
 * Miniatura cuadrada de una prenda, con el mismo emoji de respaldo que
 * `ItemCard` cuando no hay foto. La usan los pickers de "+ Añadir otra"
 * de pedidos y reservas: con varias prendas de tallas parecidas en la
 * lista, el código y el nombre solos no bastan para reconocerlas rápido.
 */
export function PrendaThumb({
  url,
  alt,
  size = 'md',
}: {
  url: string | null;
  alt: string;
  size?: 'sm' | 'md';
}) {
  const clase = size === 'sm' ? 'size-10' : 'size-12';

  return (
    <div
      className={`${clase} shrink-0 overflow-hidden rounded-[--radius-control] border border-line bg-surface`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración
        <img src={url} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-base text-muted" aria-hidden>
          👕
        </div>
      )}
    </div>
  );
}
