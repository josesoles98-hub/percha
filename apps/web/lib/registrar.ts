import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Cliente no autenticado hacia la Función Edge registrar-pedido: el link
 * único y fijo por tienda donde un cliente registra su compra de punta a
 * punta, sin que la dueña tenga que crear el pedido primero.
 */
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/registrar-pedido`;

function headers() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

export type DocType = 'DNI' | 'RUC' | 'CE';

export interface Agencia {
  id: number;
  name: string;
}

export interface DatosTiendaPublico {
  storeName: string;
  defaultPackageType: string;
  agencias: Agencia[];
}

export async function obtenerDatosTienda(
  storeId: string,
): Promise<{ data: DatosTiendaPublico | null; error: string | null }> {
  try {
    const respuesta = await fetch(`${FUNCTION_URL}?storeId=${storeId}`, { headers: headers() });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) return { data: null, error: cuerpo.error ?? 'No se pudo cargar' };
    return { data: cuerpo as DatosTiendaPublico, error: null };
  } catch {
    return { data: null, error: 'No se pudo conectar. Revisa tu internet e intenta de nuevo.' };
  }
}

export async function registrarPedido(
  storeId: string,
  form: FormData,
): Promise<{ code: string | null; error: string | null }> {
  form.set('storeId', storeId);
  try {
    const respuesta = await fetch(FUNCTION_URL, { method: 'POST', headers: headers(), body: form });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) return { code: null, error: cuerpo.error ?? 'No se pudo registrar' };
    return { code: cuerpo.code as string, error: null };
  } catch {
    return { code: null, error: 'No se pudo conectar. Revisa tu internet e intenta de nuevo.' };
  }
}
