'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildShareText, buildWhatsAppUrl, type Item, type StoreSettings } from '@percha/core';

import { registrarCompartido } from '@/lib/data/mutations';
import { createClient } from '@/lib/supabase/client';

import { useToast, vibrar } from './Toast';

/**
 * Baja una foto y la deja lista como archivo. Comprueba que la respuesta sea
 * buena: sin esto, una URL vencida o un corte de red devolvía un JSON de
 * error que se enviaba a WhatsApp disfrazado de foto (le llega rota al grupo).
 */
async function descargarFoto(url: string, nombre: string): Promise<File> {
  let ultimoError: unknown;
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const respuesta = await fetch(url);
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const blob = await respuesta.blob();
      if (blob.size === 0) throw new Error('Foto vacía');
      return new File([blob], nombre, { type: 'image/jpeg' });
    } catch (error) {
      ultimoError = error;
    }
  }
  throw ultimoError;
}

/**
 * Hoja de compartir.
 *
 * ⚠️ Limitación real de WhatsApp: la Web Share API permite enviar archivos y
 * texto juntos, pero WhatsApp en iOS a menudo se queda solo con las imágenes
 * y DESCARTA el texto. No es algo que podamos arreglar desde el código.
 *
 * La estrategia es de tres capas:
 *   1. Copiar siempre el mensaje al portapapeles antes de abrir el share
 *      sheet, y avisarlo. Si el texto se pierde, un pegado largo lo recupera.
 *   2. Botón "Solo texto a WhatsApp" (wa.me), donde el texto va garantizado.
 *   3. (Fase 4) Imagen única con los datos incrustados, para que el mensaje
 *      viaje dentro de la foto y no se pueda perder.
 */
export function ShareSheet({
  item,
  store,
  fotoUrls,
  abierto,
  onCerrar,
}: {
  item: Item;
  store: StoreSettings;
  fotoUrls: string[];
  abierto: boolean;
  onCerrar: () => void;
}) {
  const { mostrar } = useToast();
  const textoInicial = useMemo(() => buildShareText(item, store), [item, store]);
  const [texto, setTexto] = useState(textoInicial);
  const [editando, setEditando] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<number[]>(() =>
    fotoUrls.map((_, i) => i),
  );
  const [ocupado, setOcupado] = useState(false);

  // Las fotos se bajan al ABRIR la hoja, no al tocar "Compartir": con mala
  // señal la descarga tardaba lo bastante como para que el celular dejara de
  // considerar el toque como un gesto del usuario y rechazara el share. Así,
  // al tocar el botón ya están en memoria y se comparte al instante.
  const [archivos, setArchivos] = useState<Record<string, File>>({});
  const [fallidas, setFallidas] = useState<string[]>([]);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;

    fotoUrls.forEach((url, indice) => {
      void (async () => {
        try {
          const archivo = await descargarFoto(url, `${item.code}-${indice + 1}.jpg`);
          if (!cancelado) setArchivos((previos) => ({ ...previos, [url]: archivo }));
        } catch {
          if (!cancelado) setFallidas((previas) => (previas.includes(url) ? previas : [...previas, url]));
        }
      })();
    });

    return () => {
      cancelado = true;
    };
  }, [abierto, fotoUrls, item.code, intento]);

  function reintentarFotos() {
    setFallidas([]);
    setIntento((n) => n + 1);
  }

  // Si cambia la prenda o la plantilla, el mensaje se regenera. Se ajusta
  // durante el render y no en un efecto para que nunca llegue a pintarse el
  // texto de la prenda anterior.
  const [ultimoInicial, setUltimoInicial] = useState(textoInicial);
  if (textoInicial !== ultimoInicial) {
    setUltimoInicial(textoInicial);
    setTexto(textoInicial);
    setEditando(false);
  }

  if (!abierto) return null;

  async function copiar(silencioso = false) {
    try {
      await navigator.clipboard.writeText(texto);
      if (!silencioso) mostrar('Texto copiado');
      return true;
    } catch {
      return false;
    }
  }

  // Solo se comparte cuando TODAS las fotos elegidas ya están bajadas y
  // bien: nunca se manda una prenda con menos fotos (o rotas) sin avisar.
  const preparando = seleccionadas.some((i) => {
    const url = fotoUrls[i];
    return url !== undefined && !(url in archivos) && !fallidas.includes(url);
  });
  const fotosListas = seleccionadas.every((i) => {
    const url = fotoUrls[i];
    return url === undefined || url in archivos;
  });

  async function compartirConFotos() {
    setOcupado(true);
    try {
      const elegidos = seleccionadas
        .map((i) => archivos[fotoUrls[i] as string])
        .filter((f): f is File => Boolean(f));

      // Capa 1: el portapapeles como red de seguridad, SIEMPRE antes de abrir
      // el share sheet (después, el gesto del usuario ya se ha consumido).
      const copiado = await copiar(true);

      const datos: ShareData = { files: elegidos, text: texto, title: item.code };

      if (typeof navigator.canShare === 'function' && navigator.canShare(datos)) {
        await navigator.share(datos);
        vibrar();
        void marcarCompartido();
        mostrar(copiado ? 'Texto copiado — pégalo si no aparece' : 'Compartido');
        onCerrar();
        return;
      }

      // Escritorio: sin Web Share con archivos. Texto copiado + WhatsApp Web.
      mostrar('Texto copiado. Se abrirá WhatsApp Web.');
      window.open(buildWhatsAppUrl(texto), '_blank', 'noopener');
      void marcarCompartido();
      onCerrar();
    } catch (error) {
      // El usuario cancelando el share sheet lanza AbortError: no es un fallo.
      if (error instanceof Error && error.name === 'AbortError') return;
      mostrar('No se pudo compartir. El texto quedó copiado.');
      await copiar(true);
    } finally {
      setOcupado(false);
    }
  }

  function soloTexto() {
    void copiar(true);
    void marcarCompartido();
    window.open(buildWhatsAppUrl(texto), '_blank', 'noopener');
    onCerrar();
  }

  async function marcarCompartido() {
    const supabase = createClient();
    await registrarCompartido(supabase, item.id, item.shareCount);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compartir prenda"
      className="fixed inset-0 z-[70] flex items-end justify-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/50"
      />

      <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[--radius-sheet] border-t border-line bg-bg px-4 pb-safe pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden />
        <h2 className="mb-3 text-title">Compartir prenda</h2>

        {editando ? (
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={10}
            className="w-full rounded-[--radius-card] border border-line bg-surface p-3 text-label outline-none focus:border-accent"
          />
        ) : (
          <div className="relative rounded-[--radius-card] border border-line bg-surface p-3">
            <pre className="whitespace-pre-wrap break-words font-sans text-label">{texto}</pre>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="tap mt-2 text-caption text-muted underline underline-offset-2"
            >
              ✎ Editar
            </button>
          </div>
        )}

        {fotoUrls.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-label font-medium">Fotos a enviar</p>
            <div className="flex gap-2">
              {fotoUrls.map((url, indice) => {
                const activa = seleccionadas.includes(indice);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() =>
                      setSeleccionadas((previas) =>
                        activa ? previas.filter((i) => i !== indice) : [...previas, indice].sort(),
                      )
                    }
                    aria-pressed={activa}
                    className={`relative size-16 overflow-hidden rounded-[--radius-control] border-2 ${
                      activa ? 'border-accent' : 'border-line opacity-50'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada */}
                    <img src={url} alt={`Foto ${indice + 1}`} className="size-full object-cover" />
                    {activa && (
                      <span className="absolute bottom-0 right-0 bg-accent px-1 text-[10px] text-accent-ink">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {fallidas.length > 0 && (
              <div role="alert" className="mt-3 rounded-[--radius-control] border border-status-sold/40 bg-status-sold/10 p-3">
                <p className="text-label">
                  No se pudo cargar {fallidas.length === 1 ? 'una foto' : `${fallidas.length} fotos`}.
                  Revisa tu internet o vuelve a abrir la prenda.
                </p>
                <button
                  type="button"
                  onClick={reintentarFotos}
                  className="tap mt-1 text-label font-medium underline underline-offset-2"
                >
                  🔁 Reintentar
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={() => void compartirConFotos()}
            disabled={ocupado || seleccionadas.length === 0 || !fotosListas}
            className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3.5 font-semibold text-accent-ink disabled:opacity-40"
          >
            {ocupado ? 'Preparando…' : preparando ? 'Cargando fotos…' : '📤 Compartir con fotos'}
          </button>

          <button
            type="button"
            onClick={soloTexto}
            className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 font-medium"
          >
            💬 Solo texto a WhatsApp
          </button>

          <button
            type="button"
            onClick={() => void copiar()}
            className="tap w-full py-2 text-label text-muted"
          >
            📋 Copiar texto
          </button>
        </div>

        <p className="mt-3 pb-3 text-caption text-muted">
          WhatsApp a veces se queda solo con las fotos y quita el texto. Por eso lo copiamos
          siempre: si no aparece, mantén pulsado en el chat y pega.
        </p>
      </div>
    </div>
  );
}
