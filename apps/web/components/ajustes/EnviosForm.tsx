'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PACKAGE_TYPES, type PackageType } from '@percha/core';

import { SelectorAgencia } from '@/components/envios/SelectorAgencia';
import { useToast } from '@/components/Toast';
import type { Agencia } from '@/lib/data/orders';
import { actualizarTienda } from '@/lib/data/settings';
import { createClient } from '@/lib/supabase/client';

/**
 * Ajustes de envío: se configuran una vez y no se vuelven a tocar.
 */
export function EnviosForm({
  storeId,
  origenInicial,
  paqueteInicial,
  whatsappInicial,
  puedeEditar,
}: {
  storeId: string;
  origenInicial: Agencia | null;
  paqueteInicial: PackageType;
  whatsappInicial: string;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  const [origen, setOrigen] = useState<Agencia | null>(origenInicial);
  const [paquete, setPaquete] = useState<PackageType>(paqueteInicial);
  const [whatsapp, setWhatsapp] = useState(whatsappInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hayCambios =
    origen?.id !== origenInicial?.id || paquete !== paqueteInicial || whatsapp !== whatsappInicial;

  async function guardar() {
    setGuardando(true);
    setError(null);

    const { error: errorGuardado } = await actualizarTienda(createClient(), storeId, {
      shalomOriginAgencyId: origen?.id ?? null,
      defaultPackageType: paquete,
      shippingEnabled: Boolean(origen),
      whatsappNumber: whatsapp,
    });

    setGuardando(false);
    if (errorGuardado) {
      setError(errorGuardado);
      return;
    }

    mostrar('Ajustes de envío guardados');
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <SelectorAgencia
          etiqueta="Tu agencia de origen"
          valor={origen?.id ?? null}
          nombreValor={origen?.name ?? null}
          onCambio={setOrigen}
        />
        <p className="mt-2 text-caption text-muted">
          Desde donde despachas. Va en la columna ORIGEN de todos los envíos, así que se
          configura una vez y ya.
        </p>
      </div>

      <div>
        <span className="mb-2 block text-label font-medium">Tamaño de paquete habitual</span>
        <div className="flex flex-wrap gap-2">
          {PACKAGE_TYPES.map((tipo) => (
            <button
              key={tipo}
              type="button"
              disabled={!puedeEditar}
              onClick={() => setPaquete(tipo)}
              aria-pressed={paquete === tipo}
              className={`tap rounded-full border px-4 text-label transition-colors disabled:opacity-50 ${
                paquete === tipo ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
              }`}
            >
              {tipo.replace('PAQUETE ', '')}
            </button>
          ))}
        </div>
        <p className="mt-2 text-caption text-muted">
          Se preselecciona al crear un pedido, para no tener que elegirlo cada vez.
        </p>
      </div>

      <div>
        <label htmlFor="whatsapp-tienda" className="mb-2 block text-label font-medium">
          Tu WhatsApp
        </label>
        <input
          id="whatsapp-tienda"
          type="tel"
          inputMode="tel"
          disabled={!puedeEditar}
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="987654321"
          className="w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-label disabled:opacity-50"
        />
        <p className="mt-2 text-caption text-muted">
          Cuando un cliente registra su pedido, le mostramos un botón para que te avise por
          WhatsApp que ya lo hizo — muchos no llegan a leer los mensajes que tú les mandas.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-label text-status-sold">
          {error}
        </p>
      )}

      {puedeEditar ? (
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !hayCambios}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      ) : (
        <p className="text-caption text-muted">Solo el dueño puede cambiar estos ajustes.</p>
      )}
    </div>
  );
}
