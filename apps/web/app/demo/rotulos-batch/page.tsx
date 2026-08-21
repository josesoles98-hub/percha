/* TEMPORAL — vista de prueba de la tira de rótulos. Se borra cuando ya
 * no haga falta. */
import { RotulosBatch } from '@/components/envios/RotulosBatch';
import type { EnvioPendiente } from '@/lib/data/orders';

const ENVIOS_DEMO: EnvioPendiente[] = [
  {
    id: '1',
    shipmentId: '1',
    orderId: '1',
    orderCode: 'PED-000041',
    customerName: 'María Quispe',
    docType: 'DNI',
    docNumber: '70503353',
    phone: '987654321',
    originAgency: 'LIMA - CENTRO',
    destinyAgency: 'ATOCONGO',
    packageType: 'PAQUETE XS',
    heightCm: 0,
    widthCm: 0,
    lengthCm: 0,
    weightKg: 0,
    packagesCount: 1,
    contactDoc: null,
    contactPhone: null,
    grrNumber: null,
  },
  {
    id: '2',
    shipmentId: '2',
    orderId: '2',
    orderCode: 'PED-000042',
    customerName: 'Jorge Ramírez',
    docType: 'DNI',
    docNumber: '45612378',
    phone: '912345678',
    originAgency: 'LIMA - CENTRO',
    destinyAgency: 'AÑO NUEVO',
    packageType: 'PAQUETE S',
    heightCm: 0,
    widthCm: 0,
    lengthCm: 0,
    weightKg: 0,
    packagesCount: 2,
    contactDoc: null,
    contactPhone: null,
    grrNumber: null,
  },
];

export default function DemoRotulosBatchPage() {
  return <RotulosBatch envios={ENVIOS_DEMO} storeName="American Vintage Club" />;
}
