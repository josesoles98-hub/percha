import { describe, expect, it } from 'vitest';

import { normalizarCodigo, parseSearchQuery } from '../search/query';

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34'] as const;
const buscar = (entrada: string) => parseSearchQuery(entrada, { tallas: TALLAS });

describe('normalizarCodigo', () => {
  it('rellena con ceros hasta seis dígitos', () => {
    expect(normalizarCodigo('pr', '128')).toBe('PR-000128');
    expect(normalizarCodigo('PR', '000128')).toBe('PR-000128');
  });
});

describe('parseSearchQuery', () => {
  it('una búsqueda vacía no busca nada', () => {
    expect(buscar('').vacio).toBe(true);
    expect(buscar('   ').vacio).toBe(true);
  });

  it('reconoce el código completo, con o sin guion', () => {
    expect(buscar('PR-000128').code).toBe('PR-000128');
    expect(buscar('pr-128').code).toBe('PR-000128');
    expect(buscar('PR128').code).toBe('PR-000128');
  });

  it('trata los dígitos sueltos como código Y como precio', () => {
    // Escribir "50" puede ser el precio o la prenda 50. Adivinar mal
    // significa no encontrar lo que buscas, así que se buscan los dos.
    const intent = buscar('50');
    expect(intent.codeDigits).toBe('50');
    expect(intent.priceCents).toBe(5000);
    expect(intent.text).toBeNull();
  });

  it('reconoce el precio cuando lleva símbolo o decimales', () => {
    expect(buscar('S/50').priceCents).toBe(5000);
    expect(buscar('50.50').priceCents).toBe(5050);
    expect(buscar('$120').priceCents).toBe(12000);
  });

  it('reconoce las tallas del catálogo de la tienda', () => {
    expect(buscar('L').sizeLabel).toBe('L');
    expect(buscar('xl').sizeLabel).toBe('XL');
    expect(buscar('L').text).toBeNull();
  });

  it('una talla numérica también puede ser un código', () => {
    // '32' es talla de pantalón, pero PR-000032 existe igual.
    const intent = buscar('32');
    expect(intent.sizeLabel).toBe('32');
    expect(intent.codeDigits).toBe('32');
  });

  it('no inventa tallas que la tienda no tiene', () => {
    expect(buscar('XXXL').sizeLabel).toBeNull();
    expect(buscar('XXXL').text).toBe('XXXL');
  });

  it('lo demás es texto libre', () => {
    expect(buscar('nike').text).toBe('nike');
    expect(buscar('casaca negra').text).toBe('casaca negra');
    expect(buscar('adiddas').text).toBe('adiddas');
  });

  it('sin catálogo de tallas, una talla es texto', () => {
    expect(parseSearchQuery('L').text).toBe('L');
  });
});
