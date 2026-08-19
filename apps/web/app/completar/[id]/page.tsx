import { CompletarForm } from '@/components/completar/CompletarForm';

export const dynamic = 'force-dynamic';

export default async function CompletarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompletarForm orderId={id} />;
}
