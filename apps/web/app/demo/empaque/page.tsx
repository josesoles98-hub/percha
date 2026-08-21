/* TEMPORAL — vista de prueba de la lista de empaque. Se borra cuando ya
 * no haga falta. */
import { EmpaqueBatch } from '@/components/envios/EmpaqueBatch';
import type { PedidoEmpaque } from '@/lib/data/orders';

const PEDIDOS_DEMO: PedidoEmpaque[] = [
  {
    orderId: '1',
    orderCode: 'PED-000041',
    customerName: 'María Quispe',
    prendas: [
      { code: 'AVC-001', name: "Casaca Levi's", sizeLabel: 'M', photoUrl: null },
    ],
  },
  {
    orderId: '2',
    orderCode: 'PED-000042',
    customerName: 'Jorge Ramírez',
    prendas: [
      { code: 'AVC-014', name: 'Polo Nike vintage', sizeLabel: 'L', photoUrl: null },
      { code: 'AVC-015', name: 'Jean Levi\'s 501', sizeLabel: '32', photoUrl: null },
    ],
  },
];

export default function DemoEmpaquePage() {
  return <EmpaqueBatch pedidos={PEDIDOS_DEMO} storeName="American Vintage Club" />;
}
