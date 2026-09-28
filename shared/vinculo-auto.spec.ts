import {
  decidirGtin,
  municipioIgual,
  termosDeBusca,
  tokensContidos,
  type OfertaComGtin,
} from './vinculo-auto';

const LOJA = {
  razaoSocial: 'Sanches e Vecchiate Ltda',
  logradouro: 'Rua Das Acacias',
  municipio: 'St Anton Da Platina',
};

function oferta(descricao: string, gtin: string | null, loja: string, valor = 1): OfertaComGtin {
  return {
    descricao,
    gtin,
    valor,
    estabelecimento: {
      razaoSocial: loja,
      logradouro: `RUA ${loja}`,
      municipio: 'SANTO ANTONIO DA PLATINA',
    },
  };
}

describe('termosDeBusca', () => {
  it('expande abreviações e tira medidas; alternativa com as duas palavras mais longas', () => {
    expect(termosDeBusca('Det Ype 500ml Coco')).toEqual(['detergente ype coco', 'detergente coco']);
  });

  it('sem repetir quando só há duas palavras', () => {
    expect(termosDeBusca('Cafe Itamaraty 500g')).toEqual(['cafe itamaraty']);
  });

  it('descarta palavras de menos de 3 letras', () => {
    expect(termosDeBusca('Cr d Close Up 130g')).toEqual(['close']);
  });
});

describe('tokensContidos', () => {
  it('aceita prefixo (descrição cortada ou abreviada)', () => {
    expect(tokensContidos(['REQ', 'BATAVO', 'LIGH'], ['REQUEIJAO', 'BATAVO', 'LIGHT'])).toBe(true);
  });

  it('recusa token ausente', () => {
    expect(tokensContidos(['DETERGENTE', 'YPE', 'COCO'], ['DETERGENTE', 'YPE'])).toBe(false);
  });
});

describe('municipioIgual', () => {
  it.each([
    ['St Anton Da Platina', 'SANTO ANTONIO DA PLATINA', true],
    ['Curitiba', 'CURITIBA', true],
    ['Sao Jose Dos Pinhais', 'SAO JOSE', false],
    ['Londrina', 'LAPA', false],
  ])('%s × %s → %s', (a, b, esperado) => {
    expect(municipioIgual(a, b)).toBe(esperado);
  });
});

describe('decidirGtin', () => {
  const item = { descricao: 'Det Ype 500ml Coco', vlUnit: 2.39, loja: LOJA };

  it('um único GTIN em 2 lojas → vincular por consenso', () => {
    const d = decidirGtin(item, [
      oferta('DETERGENTE YPE 500ML COCO', '7896098900239', 'LUZA'),
      oferta('YPE COCO DETERGENTE 500ML', '7896098900239', 'TUPI'),
      oferta('DETERGENTE YPE 500ML', '7896098900253', 'TUPI'),
    ]);
    expect(d).toMatchObject({ tipo: 'vincular', gtin: '7896098900239', motivo: 'consenso' });
  });

  it('um único GTIN numa loja só não basta', () => {
    const d = decidirGtin(item, [oferta('DETERGENTE YPE 500ML COCO', '7896098900239', 'LUZA')]);
    expect(d).toEqual({
      tipo: 'ambiguo',
      candidatos: [{ gtin: '7896098900239', descricao: 'DETERGENTE YPE 500ML COCO', lojas: 1 }],
    });
  });

  it('a mesma loja pelo mesmo preço vincula mesmo sozinha', () => {
    const d = decidirGtin(item, [
      {
        ...oferta('DETERGENTE YPE COCO 500ML', '7896098900239', 'X', 2.39),
        estabelecimento: {
          razaoSocial: 'SANCHES E VECCHIATE LTDA',
          logradouro: 'DAS ACACIAS',
          municipio: 'SANTO ANTONIO DA PLATINA',
        },
      },
    ]);
    expect(d).toMatchObject({ tipo: 'vincular', motivo: 'mesma-loja' });
  });

  it('GTINs concorrentes → ambíguo, ordenado por nº de lojas, até 3', () => {
    const d = decidirGtin({ ...item, descricao: 'Cafe Itamaraty 500g' }, [
      oferta('CAFE ITAMARATY 500G', '7896045102501', 'A'),
      oferta('CAFE ITAMARATY 500G TR', '7896045102501', 'B'),
      oferta('CAFE ITAMARATY 500G EXTRA', '7896045102495', 'C'),
      oferta('CAFE ITAMARATY 500G', '7896005806012', 'D'),
      oferta('CAFE ITAMARATY 500G PCT', '7896045111060', 'E'),
    ]);
    expect(d.tipo).toBe('ambiguo');
    if (d.tipo !== 'ambiguo') return;
    expect(d.candidatos).toHaveLength(3);
    expect(d.candidatos[0]).toMatchObject({ gtin: '7896045102501', lojas: 2 });
  });

  it('conteúdo diferente e GTIN inválido nunca casam', () => {
    const d = decidirGtin(item, [
      oferta('DETERGENTE YPE COCO 5L', '7896098900239', 'A'),
      oferta('DETERGENTE YPE COCO 500ML', '7896098900230', 'B'),
      oferta('DETERGENTE YPE COCO 500ML', null, 'C'),
    ]);
    expect(d).toEqual({ tipo: 'sem-resultado' });
  });
});
