import { RegistrarForm } from '@/components/registrar/RegistrarForm';

export const dynamic = 'force-dynamic';

export default async function RegistrarPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return <RegistrarForm storeId={storeId} />;
}
