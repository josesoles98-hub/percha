import { describe, expect, it } from 'vitest';

import { extraerCampos } from '../leer-boleta';

/**
 * Texto de ejemplo con la misma forma que saca pdfjs de una boleta real
 * de Shalom: NRO. ORDEN y CÓDIGO son una tabla, así que en el texto
 * extraído las dos ETIQUETAS van juntas primero y los dos VALORES
 * después — no "etiqueta: valor" pegados como en el resto de la boleta.
 * Datos inventados, no son de ningún cliente real.
 */
const TEXTO_BOLETA_DEMO = `
SHALOM EMPRESARIAL S.A.C
DATOS TICKET SHALOM
DATOS
NRO. ORDEN: CÓDIGO: 12345678 ABCD
Fecha Emisión: 2026-01-01 10:00:00
DATOS DEL REMITENTE
Nombre/Raz. Social: PERSONA REMITENTE EJEMPLO
DNI/RUC: 11111111 - Telefono: 900000000
GRR:
DATOS DEL DESTINATARIO
Nombre/Raz. Social: PERSONA DESTINATARIA EJEMPLO
DNI/RUC: 22222222 - Telefono: 911111111
ENTREGA
`;

describe('extraerCampos', () => {
  it('separa NRO. ORDEN y CÓDIGO aunque salgan como etiquetas-luego-valores', () => {
    const { orden, codigo } = extraerCampos(TEXTO_BOLETA_DEMO);
    expect(orden).toBe('12345678');
    expect(codigo).toBe('ABCD');
  });

  it('toma el DNI del destinatario, no el del remitente', () => {
    const { dni } = extraerCampos(TEXTO_BOLETA_DEMO);
    expect(dni).toBe('22222222');
  });

  it('devuelve null si no encuentra los campos', () => {
    expect(extraerCampos('un pdf que no es una boleta de Shalom')).toEqual({
      dni: null,
      orden: null,
      codigo: null,
    });
  });
});
