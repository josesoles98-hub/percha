'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { buildWhatsAppUrl, enviosValidos, formatDateTime } from '@percha/core';

import { useToast, vibrar } from '@/components/Toast';
import {
  linkRegistrarPedido,
  listarEnviosPendientes,
  marcarLoteRegistrado,
  registrarLote,
  type EnvioPendiente,
  type Lote,
} from '@/lib/data/orders';
import { descargar, generarArchivos } from '@/lib/shipping/generar-excel';
import { createClient } from '@/lib/supabase/client';

/**
 * Envíos pendientes de registrar en Shalom Pro.
 *
 * El flujo conserva exactamente el que ya usa el usuario —generar un
 * archivo y subirlo a Shalom— pero el archivo lo arma la app sin errores
 * de tipeo. Lo importante es que los problemas se ven ANTES de descargar
 * nada: subir un archivo y que lo rechacen sin explicación es lo peor que
 * puede pasar aquí.
 */
export function PanelEnvios({
  storeId,
  pendientes: pendientesIniciales,
  lotes,
  agenciaOrigen,
}: {
  storeId: string;
  pendientes: EnvioPendiente[];
  lotes: Lote[];
  agenciaOrigen: string | null;
}) {
  const router = useRouter();
  const { mostrar } = useToast();

  const [pendientes, setPendientes] = useState(pendientesIniciales);
  const [generando, setGenerando] = useState(false);

  const { validos, problemas } = useMemo(() => enviosValidos(pendientes), [pendientes]);

  const problemasPorEnvio = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const p of problemas) {
      mapa.set(p.envioId, [...(mapa.get(p.envioId) ?? []), p.mensaje]);
    }
    return mapa;
  }, [problemas]);

  const archivosPrevistos = Math.ceil(validos.length / 499) || 0;

  async function generar() {
    if (validos.length === 0) return;
    setGenerando(true);

    try {
      const archivos = await generarArchivos(validos);
      const supabase = createClient();

      // Un lote por archivo: si se parte en dos, cada uno se sube y se
      // confirma por separado.
      let desde = 0;
      for (const archivo of archivos) {
        const delArchivo = validos.slice(desde, desde + archivo.filas);
        desde += archivo.filas;

        descargar(archivo);

        const { error } = await registrarLote(
          supabase,
          storeId,
          archivo.nombre,
          delArchivo.map((e) => e.shipmentId),
        );
        if (error) mostrar(error);
      }

      vibrar();
      mostrar(
        archivos.length === 1
          ? `${archivos[0]?.filas} envíos listos para subir`
          : `${archivos.length} archivos descargados`,
      );

      setPendientes(await listarEnviosPendientes(supabase, storeId));
      router.refresh();
    } catch (error) {
      mostrar(error instanceof Error ? error.message : 'No se pudo generar el archivo');
    } finally {
      setGenerando(false);
    }
  }

  async function confirmarLote(lote: Lote) {
    const supabase = createClient();
    const { error } = await marcarLoteRegistrado(supabase, lote.id);

    if (error) {
      mostrar('No se pudo confirmar el lote');
      return;
    }
    mostrar('Lote confirmado');
    router.refresh();
  }

  async function copiarLinkRegistro() {
    try {
      await navigator.clipboard.writeText(linkRegistrarPedido(storeId));
      mostrar('Link copiado');
    } catch {
      mostrar('No se pudo copiar');
    }
  }

  function enviarLinkRegistroPorWhatsApp() {
    const mensaje = [
      'Hola 👋',
      '',
      'Para registrar tu pedido, completa este formulario (toma un minuto):',
      linkRegistrarPedido(storeId),
    ].join('\n');
    window.open(buildWhatsAppUrl(mensaje), '_blank', 'noopener');
  }

  return (
    <>
      {agenciaOrigen && (
        <section className="mb-4 rounded-[--radius-card] border border-line bg-surface p-4">
          <h2 className="text-caption font-medium uppercase tracking-wide text-muted">
            Link para que registren su pedido
          </h2>
          <p className="mt-1 text-label text-muted">
            Un solo link para todos tus clientes: ponen sus datos, describen qué compraron y suben
            una foto — no hace falta crear el pedido antes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copiarLinkRegistro()}
              className="tap inline-flex rounded-[--radius-control] border border-line bg-bg px-4 py-2.5 text-label"
            >
              🔗 Copiar link
            </button>
            <button
              type="button"
              onClick={enviarLinkRegistroPorWhatsApp}
              className="tap inline-flex rounded-[--radius-control] border border-line bg-bg px-4 py-2.5 text-label"
            >
              📤 Enviar por WhatsApp
            </button>
          </div>
        </section>
      )}

      {!agenciaOrigen && (
        <div className="mb-4 rounded-[--radius-card] border border-status-sold/40 bg-status-sold/10 p-4">
          <p className="font-medium">Falta tu agencia de origen</p>
          <p className="mt-0.5 text-label text-muted">
            Sin ella no se puede generar el archivo: es la columna ORIGEN de cada envío.
          </p>
          <Link
            href="/ajustes/envios"
            className="tap mt-3 inline-flex rounded-[--radius-control] bg-accent px-4 py-2.5 font-medium text-accent-ink"
          >
            Configurar
          </Link>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-caption font-medium uppercase tracking-wide text-muted">
            Pendientes de registrar ({pendientes.length})
          </h2>
          {pendientes.length > 0 && (
            <div className="flex shrink-0 gap-3">
              <Link href="/envios/rotulos" className="tap text-caption underline underline-offset-4">
                🏷️ Rótulos
              </Link>
              <Link href="/envios/empaque" className="tap text-caption underline underline-offset-4">
                📦 Empaque
              </Link>
            </div>
          )}
        </div>

        {pendientes.length === 0 ? (
          <div className="rounded-[--radius-card] border border-line bg-surface p-6 text-center">
            <div className="text-4xl" aria-hidden>
              📦
            </div>
            <p className="mt-2 font-medium">Nada por enviar</p>
            <p className="mt-0.5 text-label text-muted">
              Los envíos aparecen aquí al crear un pedido desde una prenda.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {pendientes.map((envio) => {
              const suyos = problemasPorEnvio.get(envio.id) ?? [];
              const correcto = suyos.length === 0;

              return (
                <li
                  key={envio.id}
                  className={`rounded-[--radius-card] border p-4 ${
                    correcto ? 'border-line bg-surface' : 'border-status-reserved/50 bg-status-reserved/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span aria-hidden>{correcto ? '✓' : '⚠️'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{envio.orderCode}</p>
                      <p className="text-label text-muted">
                        {envio.customerName || 'Sin nombre'}
                        {envio.docNumber ? ` · ${envio.docNumber}` : ''}
                      </p>
                      <p className="text-label text-muted">
                        → {envio.destinyAgency ?? 'sin destino'} · {envio.packageType} ·{' '}
                        {envio.packagesCount}
                      </p>

                      {suyos.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {suyos.map((mensaje) => (
                            <li key={mensaje} className="text-label">
                              {mensaje}
                            </li>
                          ))}
                        </ul>
                      )}

                      {!correcto && (
                        <Link
                          href={`/pedidos/${envio.orderCode}`}
                          className="tap mt-2 inline-flex text-label underline underline-offset-4"
                        >
                          Completar datos
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pendientes.length > 0 && (
        <section className="mt-5">
          <p className="mb-2 text-label text-muted">
            Origen: <strong className="text-ink">{agenciaOrigen ?? 'sin configurar'}</strong>{' '}
            <Link href="/ajustes/envios" className="underline underline-offset-4">
              Cambiar
            </Link>
          </p>

          <button
            type="button"
            onClick={() => void generar()}
            disabled={generando || validos.length === 0 || !agenciaOrigen}
            className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3.5 font-semibold text-accent-ink disabled:opacity-40"
          >
            {generando ? 'Generando…' : `⬇️ Generar Excel para Shalom (${validos.length})`}
          </button>

          {problemas.length > 0 && (
            <p className="mt-2 text-caption text-muted">
              {pendientes.length - validos.length}{' '}
              {pendientes.length - validos.length === 1 ? 'envío excluido' : 'envíos excluidos'} por
              datos faltantes.
            </p>
          )}
          {archivosPrevistos > 1 && (
            <p className="mt-1 text-caption text-muted">
              Son más de 499 envíos: se generarán {archivosPrevistos} archivos.
            </p>
          )}
        </section>
      )}

      {lotes.length > 0 && (
        <section className="mt-8 pb-8">
          <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
            Últimos lotes
          </h2>
          <ul className="space-y-2">
            {lotes.map((lote) => (
              <li
                key={lote.id}
                className="flex items-center gap-3 rounded-[--radius-card] border border-line bg-surface p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label font-medium">{lote.fileName}</p>
                  <p className="text-caption text-muted">
                    {formatDateTime(lote.createdAt)} · {lote.rowsCount}{' '}
                    {lote.rowsCount === 1 ? 'envío' : 'envíos'}
                  </p>
                </div>

                {lote.registeredAt ? (
                  <span className="shrink-0 text-label text-status-available">✅ Registrado</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void confirmarLote(lote)}
                    className="tap shrink-0 rounded-[--radius-control] border border-line bg-bg px-3 py-2 text-label"
                  >
                    Ya lo subí
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
