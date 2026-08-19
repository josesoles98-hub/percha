/* TEMPORAL — vista de prueba del formulario público /completar, con datos
 * de ejemplo en vez de un pedido real. Se borra cuando ya no haga falta. */
import { CompletarForm } from '@/components/completar/CompletarForm';
import type { DatosPedidoPublico } from '@/lib/completar';

const DATOS_DEMO: DatosPedidoPublico = {
  code: 'PED-000042',
  storeName: 'American Vintage Club',
  cancelado: false,
  yaCompletado: false,
  customerName: 'María Quispe',
  docType: 'DNI',
  docNumber: '',
  phone: '',
  destinyAgencyId: null,
  packageType: 'PAQUETE XS',
  packagesCount: 1,
  agencias: [
    { id: 1, name: 'LIMA - SAN JUAN DE LURIGANCHO' },
    { id: 2, name: 'LIMA - LOS OLIVOS' },
    { id: 3, name: 'AREQUIPA - CERCADO' },
    { id: 4, name: 'CUSCO - CERCADO' },
    { id: 5, name: 'TRUJILLO - CERCADO' },
    { id: 6, name: 'CHICLAYO - CERCADO' },
    { id: 7, name: 'PIURA - CERCADO' },
    { id: 8, name: 'JAÉN - CERCADO' },
  ],
};

export default function DemoCompletarPage() {
  return <CompletarForm orderId="demo" datosDemo={DATOS_DEMO} />;
}
