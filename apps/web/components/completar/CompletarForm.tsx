'use client';

import { useEffect, useState } from 'react';
import { PACKAGE_TYPES, validarDocumento, type DocType, type PackageType } from '@percha/core';

import {
  enviarDatosPedido,
  obtenerDatosPedido,
  type Agencia,
  type DatosPedidoPublico,
} from '@/lib/completar';
import { prepararFoto } from '@/lib/photos/prepare';

const TIPOS_DOC: DocType[] = ['DNI', 'RUC', 'CE'];

/**
 * Formulario público (sin sesión) para que el cliente complete sus datos
 * de envío por el link que le manda la tienda. Todo pasa por la Función
 * Edge completar-pedido — este componente no toca Supabase directamente.
 */
export function CompletarForm({
  orderId,
  datosDemo,
}: {
  orderId: string;
  /** Solo para /demo: salta la llamada a la Función Edge y usa estos datos. */
  datosDemo?: DatosPedidoPublico;
}) {
  const [cargando, setCargando] = useState(!datosDemo);
  const [datos, setDatos] = useState<DatosPedidoPublico | null>(datosDemo ?? null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [tipoDoc, setTipoDoc] = useState<DocType>(datosDemo?.docType ?? 'DNI');
  const [documento, setDocumento] = useState(datosDemo?.docNumber ?? '');
  const [telefono, setTelefono] = useState(datosDemo?.phone ?? '');
  const [agencia, setAgencia] = useState<Agencia | null>(
    datosDemo?.agencias.find((a) => a.id === datosDemo.destinyAgencyId) ?? null,
  );
  const [paquete, setPaquete] = useState<PackageType>((datosDemo?.packageType as PackageType) ?? 'PAQUETE XS');
  const [bultos, setBultos] = useState(datosDemo?.packagesCount ?? 1);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [terminoAgencia, setTerminoAgencia] = useState('');

  const MAX_FOTOS = 5;
  const [fotos, setFotos] = useState<Array<{ blob: Blob; previewUrl: string }>>([]);
  const [procesandoFoto, setProcesandoFoto] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (datosDemo) return;
    let cancelado = false;

    void (async () => {
      const { data, error: errorDatos } = await obtenerDatosPedido(orderId);
      if (cancelado) return;

      if (!data) {
        setErrorCarga(errorDatos ?? 'No se pudo cargar el pedido');
      } else {
        setDatos(data);
        setTipoDoc(data.docType);
        setDocumento(data.docNumber);
        setTelefono(data.phone);
        if (PACKAGE_TYPES.includes(data.packageType as PackageType)) {
          setPaquete(data.packageType as PackageType);
        }
        setBultos(data.packagesCount || 1);
        const actual = data.agencias.find((a) => a.id === data.destinyAgencyId);
        if (actual) setAgencia(actual);
      }
      setCargando(false);
    })();

    return () => {
      cancelado = true;
    };
    // datosDemo es fijo por el uso de /demo, no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const errorDoc = documento.trim() ? validarDocumento(tipoDoc, documento) : null;
  const puedeEnviar =
    documento.trim() !== '' && !errorDoc && telefono.trim() !== '' && agencia !== null && !enviando;

  async function agregarFotos(files: FileList) {
    const disponibles = MAX_FOTOS - fotos.length;
    if (disponibles <= 0) return;

    setProcesandoFoto(true);
    try {
      const preparadas = await Promise.all(
        Array.from(files)
          .slice(0, disponibles)
          .map(async (file) => {
            const p = await prepararFoto(file);
            return { blob: p.blob, previewUrl: p.previewUrl };
          }),
      );
      setFotos((previas) => [...previas, ...preparadas]);
    } finally {
      setProcesandoFoto(false);
    }
  }

  function quitarFoto(indice: number) {
    setFotos((previas) => previas.filter((_, i) => i !== indice));
  }

  async function enviar() {
    if (!puedeEnviar || !agencia) return;
    setEnviando(true);
    setError(null);

    const form = new FormData();
    form.set('docType', tipoDoc);
    form.set('docNumber', documento);
    form.set('phone', telefono);
    form.set('destinyAgencyId', String(agencia.id));
    form.set('packageType', paquete);
    form.set('packagesCount', String(bultos));
    fotos.forEach((f, i) => form.append('fotos', f.blob, `foto-${i + 1}.jpg`));

    const { ok, error: errorEnvio } = await enviarDatosPedido(orderId, form);
    setEnviando(false);

    if (!ok) {
      setError(errorEnvio ?? 'No se pudo guardar');
      return;
    }
    setEnviado(true);
  }

  const agenciasFiltradas = (datos?.agencias ?? []).filter((a) =>
    a.name.toLowerCase().includes(terminoAgencia.toLowerCase()),
  );

  if (cargando) return <Centro>Cargando…</Centro>;

  if (errorCarga) {
    return (
      <Centro>
        <p className="text-title">😕</p>
        <p className="mt-2 text-label text-muted">{errorCarga}</p>
      </Centro>
    );
  }

  if (!datos) return null;

  if (datos.cancelado) {
    return (
      <Centro>
        <p className="text-title">Este pedido fue cancelado.</p>
      </Centro>
    );
  }

  if (enviado || datos.yaCompletado) {
    return (
      <Centro>
        <div className="text-5xl" aria-hidden>
          ✅
        </div>
        <p className="mt-3 text-title">¡Listo!</p>
        <p className="mt-1 text-label text-muted">
          Tus datos ya quedaron guardados. {datos.storeName} se encargará del resto.
        </p>
      </Centro>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-safe">
      <header className="py-6 text-center">
        <p className="text-caption text-muted">{datos.storeName}</p>
        <h1 className="text-title">Pedido {datos.code}</h1>
        <p className="mt-1 text-label text-muted">
          Completa tus datos para que podamos enviarte tu pedido.
        </p>
      </header>

      <div className="space-y-5">
        <div>
          <span className="mb-1.5 block text-label">Documento</span>
          <div className="flex gap-2">
            <div className="flex gap-1">
              {TIPOS_DOC.map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoDoc(tipo)}
                  aria-pressed={tipoDoc === tipo}
                  className={`tap rounded-[--radius-control] border px-3 text-label transition-colors ${
                    tipoDoc === tipo ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
            <input
              inputMode={tipoDoc === 'CE' ? 'text' : 'numeric'}
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder={tipoDoc === 'DNI' ? '70503353' : tipoDoc === 'RUC' ? '20512345678' : 'A12345678'}
              aria-invalid={Boolean(errorDoc)}
              className="tap w-full flex-1 rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          </div>
          {errorDoc && (
            <p role="alert" className="mt-1 text-caption text-status-sold">
              {errorDoc}.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="telefono" className="mb-1.5 block text-label">
            Teléfono
          </label>
          <input
            id="telefono"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="987654321"
            className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-label">Agencia Shalom donde recoges</span>
          <button
            type="button"
            onClick={() => setSelectorAbierto(true)}
            className="tap flex w-full items-center justify-between rounded-[--radius-control] border border-line bg-surface px-4 py-3 text-left"
          >
            <span className={agencia ? '' : 'text-muted'}>{agencia?.name ?? 'Buscar agencia…'}</span>
            <span className="text-muted" aria-hidden>
              ▾
            </span>
          </button>
        </div>

        <div>
          <span className="mb-2 block text-label">Tamaño del paquete</span>
          <div className="flex flex-wrap gap-2">
            {PACKAGE_TYPES.map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setPaquete(tipo)}
                aria-pressed={paquete === tipo}
                className={`tap rounded-full border px-4 text-label transition-colors ${
                  paquete === tipo ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                }`}
              >
                {tipo.replace('PAQUETE ', '')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-label">Cantidad de paquetes</span>
          <button
            type="button"
            onClick={() => setBultos((b) => Math.max(1, b - 1))}
            aria-label="Un paquete menos"
            className="tap rounded-[--radius-control] border border-line bg-surface px-4 text-title"
          >
            −
          </button>
          <output className="min-w-8 text-center text-title tabular-nums">{bultos}</output>
          <button
            type="button"
            onClick={() => setBultos((b) => b + 1)}
            aria-label="Un paquete más"
            className="tap rounded-[--radius-control] border border-line bg-surface px-4 text-title"
          >
            +
          </button>
        </div>

        <div>
          <span className="mb-1.5 block text-label">Fotos de referencia (opcional)</span>
          <p className="mb-2 text-caption text-muted">
            Ayuda a {datos.storeName} a reconocer tu pedido al empacarlo — puedes subir varias, por
            ejemplo si compraste más de una prenda.
          </p>
          <div className="flex flex-wrap gap-2">
            {fotos.map((f, indice) => (
              <div key={indice} className="relative w-24">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.previewUrl}
                  alt=""
                  className="aspect-[3/4] w-full rounded-[--radius-card] object-cover"
                />
                <button
                  type="button"
                  onClick={() => quitarFoto(indice)}
                  aria-label="Quitar foto"
                  className="tap absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-caption text-white"
                >
                  ✕
                </button>
              </div>
            ))}

            {fotos.length < MAX_FOTOS && (
              <label className="tap flex aspect-[3/4] w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[--radius-card] border border-dashed border-line bg-surface text-caption text-muted">
                {procesandoFoto ? (
                  'Cargando…'
                ) : (
                  <>
                    <span aria-hidden>📷</span>
                    <span>Agregar</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void agregarFotos(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-label text-status-sold">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void enviar()}
          disabled={!puedeEnviar}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3.5 font-semibold text-accent-ink disabled:opacity-40"
        >
          {enviando ? 'Enviando…' : 'Enviar mis datos'}
        </button>
      </div>

      {selectorAbierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Elegir agencia"
          className="fixed inset-0 z-[75] flex items-end"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setSelectorAbierto(false)}
            className="absolute inset-0 bg-black/50"
          />

          <div className="relative flex max-h-[85dvh] w-full flex-col rounded-t-[--radius-sheet] bg-bg pb-safe pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />

            <div className="px-4">
              <input
                autoFocus
                type="search"
                value={terminoAgencia}
                onChange={(e) => setTerminoAgencia(e.target.value)}
                placeholder="Escribe el nombre de la agencia"
                aria-label="Buscar agencia"
                className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
              />
            </div>

            <ul className="mt-2 flex-1 overflow-y-auto px-4 pb-4">
              {agenciasFiltradas.length === 0 && (
                <li className="py-3 text-label text-muted">
                  Ninguna agencia coincide con «{terminoAgencia}».
                </li>
              )}
              {agenciasFiltradas.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAgencia(a);
                      setSelectorAbierto(false);
                    }}
                    className={`tap w-full border-b border-line py-3 text-left ${
                      a.id === agencia?.id ? 'font-semibold' : ''
                    }`}
                  >
                    {a.name}
                    {a.id === agencia?.id && <span aria-hidden> ✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">{children}</div>
  );
}
