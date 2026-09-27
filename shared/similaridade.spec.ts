import { encodeGeohash } from './geohash';
import { descricaoDominante, jaccard, mesmoEstabelecimento, separarDivergentes } from './similaridade';

describe('jaccard', () => {
  it('calcula interseção sobre união', () => {
    expect(jaccard(['A', 'B'], ['B', 'C'])).toBeCloseTo(1 / 3);
    expect(jaccard(['A'], ['A'])).toBe(1);
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(['A'], [])).toBe(0);
  });
});

describe('separarDivergentes', () => {
  const coca = ['AGUA', 'AGUA C GAS', 'CAFE VIAGEM', 'COCA LATA 350ML NORMAL', 'COCA COLA PET 2L'].map(
    (desc, i) => ({ id: i, desc }),
  );

  it('caso real do GTIN da Coca-Cola: as três primeiras são divergentes', () => {
    const { coerentes, divergentes } = separarDivergentes(coca, (x) => x.desc);
    expect(divergentes.map((x) => x.desc)).toEqual(['AGUA', 'AGUA C GAS', 'CAFE VIAGEM']);
    expect(coerentes.map((x) => x.desc)).toEqual(['COCA LATA 350ML NORMAL', 'COCA COLA PET 2L']);
  });

  it('grupo grande: a maioria define a descrição dominante', () => {
    const itens = [
      'REFRIG COCA COLA 2L',
      'COCA COLA PET 2LT',
      'REFRIGERANTE COCA-COLA ORIGINAL 2L',
      'COCA COLA 2000ML',
      'AGUA MINERAL 500ML',
    ];
    const { divergentes } = separarDivergentes(itens, (x) => x);
    expect(divergentes).toEqual(['AGUA MINERAL 500ML']);
    expect(descricaoDominante(itens)).toEqual(expect.arrayContaining(['COCA', 'COLA']));
  });

  it('sem tokens comparáveis, nada é divergente', () => {
    expect(separarDivergentes(['2L', '1KG'], (x) => x)).toEqual({ coerentes: ['2L', '1KG'], divergentes: [] });
    expect(separarDivergentes([], (x: string) => x)).toEqual({ coerentes: [], divergentes: [] });
  });
});

describe('mesmoEstabelecimento', () => {
  it('casa razão social e endereço normalizados', () => {
    expect(
      mesmoEstabelecimento(
        { nome: 'CONDOR SUPER CENTER LTDA', logradouro: 'AV. SETE DE SETEMBRO', numero: '1234' },
        { nome: 'Condor Super Center', logradouro: 'Avenida Sete de Setembro', numero: '01234' },
      ),
    ).toBe(true);
  });

  it('nomes diferentes não casam', () => {
    expect(mesmoEstabelecimento({ nome: 'MUFFATO' }, { nome: 'CONDOR' })).toBe(false);
  });

  it('mesmo nome em logradouro ou número diferente não casa', () => {
    expect(
      mesmoEstabelecimento({ nome: 'CONDOR', logradouro: 'RUA XV', numero: '10' }, { nome: 'CONDOR', logradouro: 'AV BRASIL', numero: '10' }),
    ).toBe(false);
    expect(
      mesmoEstabelecimento({ nome: 'CONDOR', logradouro: 'RUA XV', numero: '10' }, { nome: 'CONDOR', logradouro: 'R XV', numero: '99' }),
    ).toBe(false);
  });

  it('sem endereço, decide pelo nome', () => {
    expect(mesmoEstabelecimento({ nome: 'MERCADO BOM PRECO' }, { nome: 'BOM PRECO SUPERMERCADOS' })).toBe(true);
  });
});

describe('encodeGeohash', () => {
  it('Curitiba começa com 6gkz', () => {
    const h = encodeGeohash(-25.4284, -49.2733, 9);
    expect(h).toHaveLength(9);
    expect(h.startsWith('6gkz')).toBe(true);
  });

  it('precisão padrão é 7', () => {
    expect(encodeGeohash(-25.4284, -49.2733)).toHaveLength(7);
    expect(encodeGeohash(-25.4284, -49.2733, 9).startsWith(encodeGeohash(-25.4284, -49.2733))).toBe(true);
  });

  it('valores conhecidos', () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encodeGeohash(0, 0, 5)).toBe('s0000');
  });

  it('rejeita coordenada inválida', () => {
    expect(() => encodeGeohash(91, 0)).toThrow(RangeError);
    expect(() => encodeGeohash(0, Number.NaN)).toThrow(RangeError);
  });
});
