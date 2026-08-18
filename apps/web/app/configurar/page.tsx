/**
 * Pantalla de ayuda cuando faltan las credenciales de Supabase.
 *
 * Es pública y no depende de la base de datos: es justamente la que se ve
 * cuando la base de datos todavía no existe.
 */
export default function ConfigurarPage() {
  const pasos = [
    {
      titulo: 'Crea el proyecto en Supabase',
      detalle: 'supabase.com → New project. El plan gratuito basta de sobra para empezar.',
    },
    {
      titulo: 'Copia las credenciales',
      detalle: 'Settings → API. Necesitas la Project URL y la clave anon / publishable.',
    },
    {
      titulo: 'Crea apps/web/.env.local',
      detalle: 'Copia .env.example y pega ahí los dos valores.',
    },
    {
      titulo: 'Aplica las migraciones',
      detalle: 'npx supabase link --project-ref TU_REF && npm run db:push',
    },
    {
      titulo: 'Reinicia el servidor',
      detalle: 'npm run dev',
    },
  ];

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-display">Casi listo</h1>
      <p className="mt-2 text-muted">
        La app está montada, pero todavía no sabe a qué base de datos conectarse.
      </p>

      <ol className="mt-8 space-y-5">
        {pasos.map((paso, i) => (
          <li key={paso.titulo} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-caption font-semibold">
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{paso.titulo}</p>
              <p className="mt-0.5 text-label text-muted">{paso.detalle}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 rounded-[--radius-card] border border-line bg-surface p-4 text-label text-muted">
        La clave <code>anon</code> es pública por diseño: va al navegador y está limitada por las
        políticas RLS de la base de datos. La clave <code>service_role</code> nunca debe ponerse
        aquí.
      </p>
    </main>
  );
}
