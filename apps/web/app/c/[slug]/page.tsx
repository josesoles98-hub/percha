import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CatalogoCliente } from '@/components/catalogo/CatalogoCliente';
import { obtenerCatalogo } from '@/lib/catalogo';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const catalogo = await obtenerCatalogo(slug);
  if (!catalogo) return { title: 'Catálogo' };
  const titulo = `Catálogo · ${catalogo.tienda.nombre}`;
  const descripcion = `${catalogo.prendas.length} prendas disponibles. Elige la tuya y pídela por WhatsApp.`;
  const portada = catalogo.prendas[0]?.fotos[0];
  return {
    title: { absolute: titulo },
    description: descripcion,
    // Al pegar el link en WhatsApp sale esta vista previa.
    openGraph: { title: titulo, description: descripcion, images: portada ? [portada] : [] },
  };
}

export default async function CatalogoPage({ params }: Props) {
  const { slug } = await params;
  const catalogo = await obtenerCatalogo(slug);
  if (!catalogo) notFound();
  return <CatalogoCliente catalogo={catalogo} />;
}
