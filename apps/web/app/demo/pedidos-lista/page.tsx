/* TEMPORAL — vista de prueba de la lista de pedidos con el toggle de
 * empacado. Se borra cuando ya no haga falta. */
import { PedidosLista } from '@/components/envios/PedidosLista';
import { ToastProvider } from '@/components/Toast';
import type { PedidoResumen } from '@/lib/data/orders';

const PEDIDOS_DEMO: PedidoResumen[] = [
  {
    id: '1',
    code: 'PED-000041',
    status: 'draft',
    totalCents: 15000,
    createdAt: new Date().toISOString(),
    customerName: 'María Quispe',
    prendas: 1,
    destinyAgencyName: 'ATOCONGO',
    shipmentStatus: 'pending',
    packedAt: null,
  },
  {
    id: '2',
    code: 'PED-000042',
    status: 'draft',
    totalCents: 25000,
    createdAt: new Date().toISOString(),
    customerName: 'Jorge Ramírez',
    prendas: 2,
    destinyAgencyName: 'AÑO NUEVO',
    shipmentStatus: 'pending',
    packedAt: new Date().toISOString(),
  },
  {
    id: '3',
    code: 'PED-000043',
    status: 'cancelled',
    totalCents: 8000,
    createdAt: new Date().toISOString(),
    customerName: 'Ana Torres',
    prendas: 1,
    destinyAgencyName: null,
    shipmentStatus: null,
    packedAt: null,
  },
];

export default function DemoPedidosListaPage() {
  return (
    <ToastProvider>
      <main className="mx-auto max-w-3xl px-4 pt-safe">
        <PedidosLista pedidos={PEDIDOS_DEMO} simbolo="S/" />
      </main>
    </ToastProvider>
  );
}
