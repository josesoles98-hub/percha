import { describe, expect, it } from 'vitest';

import {
  COLUMNAS,
  MAX_FILAS_POR_ARCHIVO,
  PACKAGE_TYPES,
  construirFila,
  enviosValidos,
  nombreArchivo,
  normalizarTelefono,
  repartirEnArchivos,
  validarDocumento,
  validarEnvios,
  type EnvioParaExportar,
} from '../shipping/shalom';

/** Envío correcto; cada test rompe solo lo que quiere comprobar. */
function envio(cambios: Partial<EnvioParaExportar> = {}): EnvioParaExportar {
  return {
    id: 'e1',
    orderCode: 'PED-000042',
    customerName: 'María Quispe',
    docType: 'DNI',
    docNumber: '70503353',
    phone: '987654321',
    originAgency: 'OVALO DE LA FAMILIA',
    destinyAgency: 'JAEN',
    packageType: 'PAQUETE XS',
    heightCm: 0,
    widthCm: 0,
    lengthCm: 0,
    weightKg: 0,
    packagesCount: 1,
    contactDoc: null,
    contactPhone: null,
    grrNumber: null,
    ...cambios,
  };
}

describe('formato del archivo de Shalom', () => {
  it('mantiene las 13 columnas del archivo real, en orden', () => {
    // Si Shalom cambia la plantilla, este test es el que avisa.
    expect(COLUMNAS).toEqual([
      'DESTINATARIO (DOC)',
      'TELF. DESTINATARIO',
      'CONTACTO (DOC)',
      'TELF. CONTACTO',
      'NRO GRR',
      'ORIGEN',
      'DESTINO',
      'MERCADERIA',
      'ALTO',
      'ANCHO',
      'LARGO',
      'PESO',
      'CANTIDAD',
    ]);
  });

  it('solo admite los seis tipos de mercadería de la validación', () => {
    expect(PACKAGE_TYPES).toEqual([
      'SOBRE',
      'PAQUETE XXS',
      'PAQUETE XS',
      'PAQUETE S',
      'PAQUETE M',
      'PAQUETE L',
    ]);
  });

  it('cabe un envío por fila, de la 2 a la 500', () => {
    expect(MAX_FILAS_POR_ARCHIVO).toBe(499);
  });
});

describe('validarDocumento', () => {
  it('acepta los documentos peruanos bien formados', () => {
    expect(validarDocumento('DNI', '70503353')).toBeNull();
    expect(validarDocumento('RUC', '20512345678')).toBeNull();
    expect(validarDocumento('CE', 'A12345678')).toBeNull();
  });

  it('distingue «falta» de «está mal»', () => {
    // La interfaz los trata distinto: uno se pide, el otro se corrige.
    expect(validarDocumento('DNI', null)).toBe('falta');
    expect(validarDocumento('DNI', '   ')).toBe('falta');
    expect(validarDocumento('DNI', '7050335')).toContain('7 caracteres');
  });

  it('rechaza letras en el DNI y el RUC', () => {
    expect(validarDocumento('DNI', '7050335A')).toContain('solo lleva números');
    expect(validarDocumento('RUC', '2051234567X')).toContain('solo lleva números');
  });

  it('acepta el DNI que empieza por cero', () => {
    expect(validarDocumento('DNI', '07050335')).toBeNull();
  });
});

describe('validarEnvios', () => {
  it('no se queja de un envío completo', () => {
    expect(validarEnvios([envio()])).toEqual([]);
  });

  it('dice a quién le falta el documento, con nombre y pedido', () => {
    const [problema] = validarEnvios([envio({ docNumber: null })]);
    expect(problema?.campo).toBe('docNumber');
    expect(problema?.orderCode).toBe('PED-000042');
    expect(problema?.mensaje).toContain('María Quispe');
    expect(problema?.mensaje).toContain('DNI');
  });

  it('detecta el teléfono que falta y el incompleto', () => {
    expect(validarEnvios([envio({ phone: null })])[0]?.campo).toBe('phone');
    expect(validarEnvios([envio({ phone: '12345' })])[0]?.mensaje).toContain('incompleto');
  });

  it('avisa si no hay agencia de origen configurada', () => {
    const [problema] = validarEnvios([envio({ originAgency: null })]);
    expect(problema?.mensaje).toContain('Ajustes');
  });

  it('avisa si al cliente le falta la agencia de destino', () => {
    expect(validarEnvios([envio({ destinyAgency: null })])[0]?.campo).toBe('destinyAgency');
  });

  it('exige al menos un bulto', () => {
    expect(validarEnvios([envio({ packagesCount: 0 })])[0]?.campo).toBe('packagesCount');
  });

  it('acumula varios problemas del mismo envío', () => {
    const problemas = validarEnvios([envio({ docNumber: null, phone: null, destinyAgency: null })]);
    expect(problemas).toHaveLength(3);
  });

  it('separa los válidos de los que tienen problemas', () => {
    const { validos, problemas } = enviosValidos([
      envio({ id: 'ok' }),
      envio({ id: 'malo', docNumber: null }),
    ]);
    expect(validos.map((e) => e.id)).toEqual(['ok']);
    expect(problemas).toHaveLength(1);
  });
});

describe('construirFila', () => {
  it('coloca cada dato en su columna', () => {
    const fila = construirFila(envio());
    expect(fila).toHaveLength(COLUMNAS.length);
    expect(fila).toEqual([
      '70503353',
      '987654321',
      '',
      '',
      '',
      'OVALO DE LA FAMILIA',
      'JAEN',
      'PAQUETE XS',
      0,
      0,
      0,
      0,
      1,
    ]);
  });

  it('deja el documento como texto para no perder el cero inicial', () => {
    // Si fuera número, Excel convertiría 07050335 en 7050335.
    const fila = construirFila(envio({ docNumber: '07050335' }));
    expect(fila[0]).toBe('07050335');
    expect(typeof fila[0]).toBe('string');
  });

  it('limpia el teléfono de espacios y guiones', () => {
    expect(construirFila(envio({ phone: '987 654-321' }))[1]).toBe('987654321');
  });

  it('deja las medidas como números, que es lo que espera la hoja', () => {
    const fila = construirFila(envio({ weightKg: 1.5, packagesCount: 2 }));
    expect(typeof fila[11]).toBe('number');
    expect(fila[11]).toBe(1.5);
    expect(fila[12]).toBe(2);
  });
});

describe('normalizarTelefono', () => {
  it('conserva el prefijo internacional', () => {
    expect(normalizarTelefono('+51 987 654 321')).toBe('+51987654321');
  });
});

describe('repartirEnArchivos', () => {
  const muchos = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('no genera archivos si no hay envíos', () => {
    expect(repartirEnArchivos([])).toEqual([]);
  });

  it('deja en uno solo lo que cabe', () => {
    expect(repartirEnArchivos(muchos(499))).toHaveLength(1);
  });

  it('parte en dos justo al pasarse por uno', () => {
    const grupos = repartirEnArchivos(muchos(500));
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toHaveLength(499);
    expect(grupos[1]).toHaveLength(1);
  });

  it('no pierde ni duplica envíos al repartir', () => {
    const total = muchos(1200);
    const grupos = repartirEnArchivos(total);
    expect(grupos.flat()).toEqual(total);
  });
});

describe('nombreArchivo', () => {
  it('lleva la fecha para reconocerlo en las descargas', () => {
    expect(nombreArchivo(new Date('2026-07-28T10:00:00Z'))).toBe('Shalom-Masivo-2026-07-28.xlsx');
  });

  it('numera las partes cuando hay varios archivos', () => {
    expect(nombreArchivo(new Date('2026-07-28T10:00:00Z'), 2, 3)).toBe(
      'Shalom-Masivo-2026-07-28-2de3.xlsx',
    );
  });
});
