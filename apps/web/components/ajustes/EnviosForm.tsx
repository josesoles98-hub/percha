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
  claveInicial,
  puedeEditar,
}: {
  storeId: string;
  origenInicial: Agencia | null;
  paqueteInicial: PackageType;
  whatsappInicial: string;
  claveInicial: string;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  const [origen, setOrigen] = useState<Agencia | null>(origenInicial);
  const [paquete, setPaquete] = useState<PackageType>(paqueteInicial);
  const [whatsapp, setWhatsapp] = useState(whatsappInicial);
  const [clave, setClave] = useState(claveInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hayCambios =
    origen?.id !== origenInicial?.id ||
    paquete !== paqueteInicial ||
    whatsapp !== whatsappInicial ||
    clave !== claveInicial;

  async function guardar() {
    if (clave && !/^\d{4}$/.test(clave)) {
      setError('La clave de recojo tiene que ser de 4 dígitos.');
      return;
    }

    setGuardando(true);
    setError(null);

    const { error: errorGuardado } = await actualizarTienda(createClient(), storeId, {
      shalomOriginAgencyId: origen?.id ?? null,
      defaultPackageType: paquete,
      shippingEnabled: Boolean(origen),
      whatsappNumber: whatsapp,
      pickupKey: clave,
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

      <div>
        <label htmlFor="clave-recojo" className="mb-2 block text-label font-medium">
          Clave de recojo
        </label>
        <input
          id="clave-recojo"
          type="text"
          inputMode="numeric"
          maxLength={4}
          disabled={!puedeEditar}
          value={clave}
          onChange={(e) => setClave(e.target.value.replace(/\D/g, ''))}
          placeholder="1234"
          className="w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-label disabled:opacity-50"
        />
        <p className="mt-2 text-caption text-muted">
          La clave de 4 dígitos que le pones a los envíos en el registro masivo de Shalom. Va en el
          mensaje de WhatsApp con la boleta, para que el cliente sepa qué decir al recoger. Si la
          cambias en Shalom, cámbiala también aquí.
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
