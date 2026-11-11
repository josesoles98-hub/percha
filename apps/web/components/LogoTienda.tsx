/**
 * Logo de la tienda en las pantallas públicas del cliente.
 *
 * `url` tiene tres estados a propósito:
 *  · undefined → la Función Edge todavía no manda el dato (versión vieja):
 *    se usa el archivo de siempre, así no se rompe nada durante un despliegue.
 *  · null      → la tienda no subió logo: se muestra solo su nombre. Nunca
 *    el de otra tienda.
 *  · string    → el logo de la tienda.
 */
const LOGO_ANTIGUO = '/logo-tienda.jpg';

export function LogoTienda({
  url,
  oscuro,
  nombre,
  variante,
}: {
  url?: string | null;
  oscuro?: boolean;
  nombre: string;
  variante: 'cabecera' | 'chico';
}) {
  const src = url === undefined ? LOGO_ANTIGUO : url;
  const fondoOscuro = url === undefined ? true : Boolean(oscuro);

  if (variante === 'chico') {
    if (!src) return <p className="mb-6 text-title font-bold">{nombre}</p>;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={nombre} className="mb-6 w-full max-w-56 rounded-[--radius-card]" />
    );
  }

  const fondo = fondoOscuro ? 'bg-black' : 'border border-line bg-surface';
  return (
    <div className={`mx-auto flex justify-center rounded-[--radius-card] px-6 py-8 ${fondo}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={nombre} className="h-auto w-full max-w-64" />
      ) : (
        <p className="text-title font-bold">{nombre}</p>
      )}
    </div>
  );
}
