/* TEMPORAL — vista de prueba de la ficha de pedido, con datos de ejemplo
 * en vez de un pedido real. Se borra cuando ya no haga falta. */
import type { StoreSettings } from '@percha/core';

import { FichaPedido } from '@/components/envios/FichaPedido';
import { ToastProvider } from '@/components/Toast';
import type { Pedido } from '@/lib/data/orders';

const STORE_DEMO: StoreSettings = {
  id: 'demo',
  name: 'American Vintage Club',
  currency: 'PEN',
  currencySymbol: 'S/',
  locale: 'es-PE',
  timezone: 'America/Lima',
  reserveDays: 2,
  codePrefix: 'AVC',
  shareTemplate: '',
  shareDepositCents: 0,
  sellersSeeTotals: true,
};

const PEDIDO_DEMO: Pedido = {
  id: 'demo-pedido',
  code: 'PED-000042',
  status: 'draft',
  totalCents: 15000,
  createdAt: new Date().toISOString(),
  customerName: 'María Quispe',
  prendas: 1,
  destinyAgencyName: null,
  shipmentStatus: 'pending',
  customerId: 'demo-cliente',
  customer: {
    id: 'demo-cliente',
    fullName: 'María Quispe',
    docType: 'DNI',
    docNumber: null,
    phone: null,
    defaultAgencyId: null,
    defaultAgencyName: null,
    ordersCount: 1,
    totalSpentCents: 15000,
  },
  subtotalCents: 15000,
  shippingCents: 0,
  paidCents: 0,
  notes: null,
  items: [{ itemId: 'demo-item', code: 'AVC-001', name: 'Casaca Levi\'s', priceCents: 15000 }],
  envio: {
    id: 'demo-envio',
    originAgencyId: 1,
    originAgencyName: 'LIMA - CENTRO',
    destinyAgencyId: null,
    destinyAgencyName: null,
    packageType: 'PAQUETE XS',
    packagesCount: 1,
    status: 'pending',
    trackingCode: null,
    exportBatchId: null,
  },
  customerDataSubmittedAt: null,
  packedAt: null,
};

export default function DemoPedidoPage() {
  return (
    <ToastProvider>
      <FichaPedido pedido={PEDIDO_DEMO} store={STORE_DEMO} fotosCliente={[]} boletaUrl={null} />
    </ToastProvider>
  );
}
