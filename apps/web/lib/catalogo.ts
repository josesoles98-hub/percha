import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Catálogo público de una tienda: lo arma la Función Edge catalogo-publico
 * (que firma las fotos del bucket privado). Lo abren los clientes sin cuenta.
 */

export interface PrendaCatalogo {
  codigo: string;
  nombre: string | null;
  marca: string | null;
  talla: string | null;
  categoria: string | null;
  emoji: string | null;
  genero: 'varon' | 'dama' | 'unisex' | null;
  precio: number;
  fotos: string[];
  /** Cargada en los últimos 3 días. */
  nueva: boolean;
}

export interface Catalogo {
  tienda: { nombre: string; logo: string | null; whatsapp: string | null; simbolo: string };
  prendas: PrendaCatalogo[];
}

export async function obtenerCatalogo(slug: string): Promise<Catalogo | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/functions/v1/catalogo-publico?tienda=${encodeURIComponent(slug)}`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        // Un minuto de caché: lo vendido desaparece rápido sin pegarle a la
        // base de datos en cada visita.
        next: { revalidate: 60 },
      },
    );
    if (!r.ok) return null;
    return (await r.json()) as Catalogo;
  } catch {
    return null;
  }
}

/** Link de WhatsApp para pedir una prenda. Números peruanos de 9 dígitos llevan el 51. */
export function linkLaQuiero(whatsapp: string, p: PrendaCatalogo, simbolo: string) {
  const digitos = whatsapp.replace(/\D/g, '');
  const numero = digitos.length === 9 ? `51${digitos}` : digitos;
  const detalle = [p.marca, p.talla ? `talla ${p.talla}` : null, `${simbolo}${p.precio}`]
    .filter(Boolean)
    .join(', ');
  const texto = `¡Hola! 🤍 Quiero la prenda ${p.codigo} (${detalle}) del catálogo`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
