import { codigoSeguro, digitoGtin, normalizarGtin, produtoIdDe } from './gtin';

describe('normalizarGtin', () => {
  it('aceita EAN-13 válido', () => {
    expect(normalizarGtin('7894900011517')).toBe('7894900011517');
    expect(normalizarGtin(' 789-4900-01151-7 ')).toBe('7894900011517');
  });

  it('rejeita DV inválido', () => {
    expect(normalizarGtin('7894900011518')).toBeNull();
  });

  it('trata SEM GTIN, vazio e nulo como null', () => {
    expect(normalizarGtin('SEM GTIN')).toBeNull();
    expect(normalizarGtin('sem gtin')).toBeNull();
    expect(normalizarGtin('')).toBeNull();
    expect(normalizarGtin(null)).toBeNull();
    expect(normalizarGtin(undefined)).toBeNull();
  });

  it('aceita EAN-8', () => {
    expect(normalizarGtin('96385074')).toBe('96385074');
  });

  it('normaliza GTIN-12 e GTIN-14 com zero à esquerda para 13', () => {
    expect(normalizarGtin('036000291452')).toBe('0036000291452');
    expect(normalizarGtin('07894900011517')).toBe('7894900011517');
  });

  it('aceita GTIN-14 de caixa', () => {
    const corpo = '1789490001151';
    const gtin14 = corpo + digitoGtin(corpo);
    expect(normalizarGtin(gtin14)).toBe(gtin14);
  });

  it('rejeita zeros e tamanhos errados', () => {
    expect(normalizarGtin('0000000000000')).toBeNull();
    expect(normalizarGtin('123456789')).toBeNull();
  });
});

describe('produtoIdDe', () => {
  it('usa o EAN quando válido', () => {
    expect(produtoIdDe('7894900011517', '03644587000836', '123')).toBe('ean:7894900011517');
  });

  it('cai para CNPJ + código interno sem EAN', () => {
    expect(produtoIdDe('SEM GTIN', '03.644.587/0008-36', ' ab/12 ')).toBe('loc:03644587000836:AB_12');
    expect(produtoIdDe(null, '03644587000836', '')).toBe('loc:03644587000836:_');
  });

  it('codigoSeguro nunca devolve barra', () => {
    expect(codigoSeguro('a/b c')).toBe('A_B_C');
  });
});
