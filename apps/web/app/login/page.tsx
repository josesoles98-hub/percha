'use client';

import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

type Metodo = 'clave' | 'enlace';

type State =
  | { kind: 'idle' }
  | { kind: 'enviando' }
  | { kind: 'enviado'; email: string }
  | { kind: 'error'; mensaje: string };

/** Mensajes de los enlaces que llegan mal, en cristiano. */
const MOTIVOS: Record<string, string> = {
  enlace_expirado:
    'Ese enlace ya no sirve: caducó o ya lo habías abierto antes. Entra con tu contraseña.',
  enlace_invalido: 'Ese enlace está incompleto. Entra con tu contraseña.',
};

/** Traduce los errores de Supabase a algo accionable. */
function explicar(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Supabase limita cuántos correos se pueden enviar por hora y ya se agotaron. Entra con tu contraseña.';
  }
  if (m.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (m.includes('email not confirmed')) {
    return 'Ese correo aún no está confirmado.';
  }
  return mensaje;
}

/**
 * Entrada a la app.
 *
 * Hay dos caminos a propósito. La contraseña es el fiable: no depende del
 * correo, no tiene límite de envíos y funciona en cualquier dispositivo —
 * además el iPhone la guarda en el llavero y la rellena sola. El enlace por
 * correo se mantiene como alternativa, pero solo sirve en el mismo
 * navegador donde se pidió.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [metodo, setMetodo] = useState<Metodo>('clave');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  const motivo = MOTIVOS[params.get('error') ?? ''] ?? null;
  const siguiente = params.get('siguiente') ?? '/';

  async function entrarConClave(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !clave) return;

    setState({ kind: 'enviando' });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: clave,
    });

    if (error) {
      setState({ kind: 'error', mensaje: explicar(error.message) });
      return;
    }

    router.push(siguiente.startsWith('/') ? siguiente : '/');
    router.refresh();
  }

  async function pedirEnlace(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setState({ kind: 'enviando' });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?siguiente=${encodeURIComponent(siguiente)}`,
      },
    });

    if (error) {
      setState({ kind: 'error', mensaje: explicar(error.message) });
      return;
    }
    setState({ kind: 'enviado', email: email.trim() });
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-title">Falta configurar Supabase</h1>
        <p className="text-muted">
          Copia <code className="rounded bg-surface px-1">.env.example</code> en{' '}
          <code className="rounded bg-surface px-1">apps/web/.env.local</code> y rellena las
          credenciales.
        </p>
      </main>
    );
  }

  if (state.kind === 'enviado') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4 text-center">
        <div className="text-5xl" aria-hidden>
          📬
        </div>
        <h1 className="text-title">Revisa tu correo</h1>
        <p className="text-muted">
          Te enviamos un enlace a <strong className="text-ink">{state.email}</strong>.{' '}
          <strong className="text-ink">Ábrelo en este mismo navegador</strong>: por seguridad, solo
          funciona donde lo pediste.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: 'idle' })}
          className="tap mt-2 text-label text-muted underline underline-offset-4"
        >
          Volver
        </button>
      </main>
    );
  }

  const ocupado = state.kind === 'enviando';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <header className="space-y-1">
        <h1 className="text-display">Percha</h1>
        <p className="text-muted">Tu inventario, listo para compartir.</p>
      </header>

      {motivo && (
        <p
          role="alert"
          className="rounded-[--radius-card] border border-status-reserved/50 bg-status-reserved/10 p-3 text-label"
        >
          {motivo}
        </p>
      )}

      <form onSubmit={metodo === 'clave' ? entrarConClave : pedirEnlace} className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-label font-medium">
            Tu correo
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
            className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
          />
        </div>

        {metodo === 'clave' && (
          <div>
            <label htmlFor="clave" className="mb-1.5 block text-label font-medium">
              Contraseña
            </label>
            <input
              id="clave"
              type="password"
              // 'current-password' hace que el iPhone la guarde en el
              // llavero y la rellene sola la próxima vez.
              autoComplete="current-password"
              required
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="tap w-full rounded-[--radius-control] border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={ocupado || email.trim() === '' || (metodo === 'clave' && clave === '')}
          className="tap w-full rounded-[--radius-control] bg-accent px-4 py-3 font-medium text-accent-ink transition-opacity disabled:opacity-40"
        >
          {ocupado ? 'Un momento…' : metodo === 'clave' ? 'Entrar' : 'Enviarme el enlace'}
        </button>

        {state.kind === 'error' && (
          <p role="alert" className="text-label text-status-sold">
            {state.mensaje}
          </p>
        )}
      </form>

      <button
        type="button"
        onClick={() => {
          setMetodo((m) => (m === 'clave' ? 'enlace' : 'clave'));
          setState({ kind: 'idle' });
        }}
        className="tap text-label text-muted underline underline-offset-4"
      >
        {metodo === 'clave' ? 'Prefiero un enlace por correo' : 'Entrar con contraseña'}
      </button>

      {metodo === 'enlace' && (
        <p className="text-caption text-muted">
          El enlace solo funciona en el navegador donde lo pides, y hay un límite de correos por
          hora. La contraseña no tiene esas pegas.
        </p>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
