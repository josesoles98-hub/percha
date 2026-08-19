import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Cliente no autenticado hacia la Función Edge completar-pedido.
 *
 * No usa el cliente de supabase-js (createClient de lib/supabase/client)
 * porque esa ruta pública no tiene ni necesita sesión: solo la clave
 * anon, igual que cualquier fetch anónimo del navegador.
 */
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/completar-pedido`;

function headers() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

export type DocType = 'DNI' | 'RUC' | 'CE';

export interface Agencia {
  id: number;
  name: string;
}

export interface DatosPedidoPublico {
  code: string;
  storeName: string;
  cancelado: boolean;
  yaCompletado: boolean;
  customerName: string;
  docType: DocType;
  docNumber: string;
  phone: string;
  destinyAgencyId: number | null;
  packageType: string;
  packagesCount: number;
  agencias: Agencia[];
}

export async function obtenerDatosPedido(
  orderId: string,
): Promise<{ data: DatosPedidoPublico | null; error: string | null }> {
  try {
    const respuesta = await fetch(`${FUNCTION_URL}?id=${orderId}`, { headers: headers() });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) return { data: null, error: cuerpo.error ?? 'No se pudo cargar el pedido' };
    return { data: cuerpo as DatosPedidoPublico, error: null };
  } catch {
    return { data: null, error: 'No se pudo conectar. Revisa tu internet e intenta de nuevo.' };
  }
}

export async function enviarDatosPedido(
  orderId: string,
  form: FormData,
): Promise<{ ok: boolean; error: string | null }> {
  form.set('orderId', orderId);
  try {
    const respuesta = await fetch(FUNCTION_URL, { method: 'POST', headers: headers(), body: form });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) return { ok: false, error: cuerpo.error ?? 'No se pudo guardar' };
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'No se pudo conectar. Revisa tu internet e intenta de nuevo.' };
  }
}
