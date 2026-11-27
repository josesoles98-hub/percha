// Función Edge: le pone a cada prenda un tipo y una descripción mirando su foto.
//
// Casi ninguna prenda tiene categoría, color ni nombre en Percha, así que
// el buscador ("shorts", "casaca negra") no tenía con qué buscar. Esta
// función mira la primera foto de cada prenda UNA sola vez y guarda
// items.ai_tipo / items.ai_desc. No toca la categoría ni nada que cargaste.
//
// La llama pg_cron cada 2 minutos (migración 20261127110000). Usa Claude
// Haiku con 10 fotos por consulta: centavos por cientos de prendas.

import Anthropic from 'npm:@anthropic-ai/sdk@1.14.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const anthropic = new Anthropic();

const MODELO = 'claude-haiku-5-5';
const POR_CONSULTA = 10;
const CONSULTAS = 3;

export const TIPOS = [
  'casaca', 'polera', 'polo', 'camisa', 'pantalon', 'jean', 'short',
  'vestido', 'falda', 'zapatilla', 'accesorio', 'otro',
] as const;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prendas'],
  properties: {
    prendas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['numero', 'tipo', 'descripcion'],
        properties: {
          numero: { type: 'integer' },
          tipo: {
            type: 'string',
            enum: [...TIPOS],
            description:
              'casaca: chaqueta, casaca, cortaviento, chaleco, parka. polera: con capucha o buzo/sudadera/hoodie/chompa/suéter. polo: camiseta/t-shirt, manga corta o larga. camisa: con cuello y botones. pantalon: de tela, buzo deportivo, jogger, cargo. jean: de mezclilla. short: pantalón corto/bermuda.',
          },
          descripcion: {
            type: 'string',
            description:
              'Palabras para encontrarla en un buscador, en español, máximo 15: color(es), sinónimos del tipo (ej. "polera hoodie capucha buzo"), estampado, texto o logo visible, marca si se lee, estilo (deportivo, oversize, vintage), para hombre/mujer si es claro.',
          },
        },
      },
    },
  },
} as const;

interface Pendiente {
  id: string;
  foto: string | null;
}

async function etiquetar(lote: Pendiente[]) {
  const conFoto = lote.filter((p) => p.foto);
  const contenido: Anthropic.ContentBlockParam[] = [];
  conFoto.forEach((p, i) => {
    contenido.push({ type: 'text', text: `Prenda ${i + 1}:` });
    contenido.push({ type: 'image', source: { type: 'url', url: p.foto! } });
  });
  contenido.push({
    type: 'text',
    text: 'Son prendas de una tienda de ropa americana vintage. Para cada una, di el tipo y una descripción corta para buscarla.',
  });

  const etiquetas = new Map<number, { tipo: string; descripcion: string }>();
  if (conFoto.length) {
    const r = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: contenido }],
    });
    const bloque = r.content.find((b) => b.type === 'text');
    if (bloque?.type === 'text') {
      const { prendas } = JSON.parse(bloque.text) as {
        prendas: Array<{ numero: number; tipo: string; descripcion: string }>;
      };
      for (const p of prendas) etiquetas.set(p.numero, p);
    }
  }

  const ahora = new Date().toISOString();
  let listas = 0;
  await Promise.all(
    lote.map(async (p) => {
      const e = p.foto ? etiquetas.get(conFoto.indexOf(p) + 1) : undefined;
      // Si Claude no la describió, se reintenta en otra vuelta (salvo que no tenga foto).
      if (!e && p.foto) return;
      await supabase
        .from('items')
        .update({
          ai_tipo: e?.tipo ?? null,
          ai_desc: e?.descripcion.trim().slice(0, 300) ?? null,
          ai_tagged_at: ahora,
        })
        .eq('id', p.id);
      if (e) listas++;
    }),
  );
  return listas;
}

function esClaveDeAdministracion(cabecera: string) {
  const token = cabecera.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
  try {
    const carga = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return carga?.role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!esClaveDeAdministracion(req.headers.get('Authorization') ?? '')) {
    return new Response('No autorizado', { status: 401 });
  }
  const cuerpo = await req.json().catch(() => ({}));
  const consultas = Math.min(CONSULTAS, Math.max(1, Number(cuerpo?.consultas) || CONSULTAS));

  // Las disponibles y reservadas, de la más nueva a la más vieja.
  const { data: items, error } = await supabase
    .from('items')
    .select('id, item_photos(storage_path, position, status)')
    .is('ai_tagged_at', null)
    .in('status', ['available', 'reserved'])
    .order('created_at', { ascending: false })
    .limit(POR_CONSULTA * consultas);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rutas = (items ?? []).map((it) => {
    const fotos = ((it.item_photos ?? []) as Array<{ storage_path: string; position: number; status: string }>)
      .filter((f) => f.status === 'ready')
      .sort((a, b) => a.position - b.position);
    return fotos[0]?.storage_path ?? null;
  });

  // Miniatura de 512 px firmada por 10 minutos: suficiente para ver la prenda.
  const firmadas = await Promise.all(
    rutas.map((ruta) =>
      ruta
        ? supabase.storage
            .from('item-photos')
            .createSignedUrl(ruta, 600, { transform: { width: 512, quality: 70 } })
            .then((r) => r.data?.signedUrl ?? null)
        : Promise.resolve(null),
    ),
  );
  const pendientes: Pendiente[] = (items ?? []).map((it, i) => ({ id: it.id, foto: firmadas[i] }));

  const lotes: Pendiente[][] = [];
  for (let i = 0; i < pendientes.length; i += POR_CONSULTA) lotes.push(pendientes.slice(i, i + POR_CONSULTA));
  const resultados = await Promise.allSettled(lotes.map(etiquetar));

  const { count } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .is('ai_tagged_at', null)
    .in('status', ['available', 'reserved']);
  return Response.json({
    listas: resultados.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value : 0), 0),
    errores: resultados.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason).slice(0, 200)),
    faltan: count ?? null,
  });
});
