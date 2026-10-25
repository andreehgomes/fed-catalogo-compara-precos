import { etiquetar } from './etiquetas';
import { etiquetasDaIa, limparNomeProduto, nomeDoItem, type NomeIa } from './nome-produto';

const ia = (extra: Partial<NomeIa>): NomeIa => ({
  nome: 'X',
  tipo: null,
  marca: null,
  variantes: [],
  tamanho: null,
  granel: false,
  ...extra,
});

describe('nomeDoItem', () => {
  it('nome quando há, senão a descrição', () => {
    expect(
      nomeDoItem({ nome: 'Detergente Ypê Coco 500 ml', descricao: 'Det Ype 500ml Coco' }),
    ).toBe('Detergente Ypê Coco 500 ml');
    expect(nomeDoItem({ descricao: 'Det Ype 500ml Coco' })).toBe('Det Ype 500ml Coco');
    expect(nomeDoItem({ nome: '', descricao: 'Det Ype 500ml Coco' })).toBe('Det Ype 500ml Coco');
  });
});

describe('limparNomeProduto', () => {
  it('colapsa espaços e aceita de 2 a 80 caracteres com letra', () => {
    expect(limparNomeProduto('  Requeijão   Batavo Light 200 g ')).toBe(
      'Requeijão Batavo Light 200 g',
    );
    expect(limparNomeProduto('Pó')).toBe('Pó');
    expect(limparNomeProduto('a'.repeat(80))).toHaveLength(80);
  });

  it('recusa vazio, curto, longo, sem letra e com controle', () => {
    for (const ruim of [null, undefined, '', '  ', 'a', 'a'.repeat(81), '123 456', 'Leite\u0000'])
      expect(limparNomeProduto(ruim)).toBeNull();
  });
});

describe('etiquetasDaIa', () => {
  it('marca e tamanho na grafia da regra; mesmo bloco da regra', () => {
    const e = etiquetasDaIa(
      ia({
        nome: 'Detergente Ypê Coco 500 ml',
        tipo: 'Detergente',
        marca: 'Ypê',
        variantes: ['coco'],
        tamanho: { quantidade: 500, unidade: 'ml' },
      }),
      'Det Ype 500ml Coco',
    );
    expect(e).toEqual({
      tipo: 'DETERGENTE',
      marca: 'YPE',
      tamanho: '0.5L',
      variantes: ['COCO'],
      bloco: 'YPE|0.5L',
      origem: 'ia',
    });
    expect(e.bloco).toBe(etiquetar('Det Ype 500ml Coco').bloco);
  });

  it('variantes compostas e abreviadas viram as da regra, sem repetir tipo e marca', () => {
    const e = etiquetasDaIa(
      ia({
        tipo: 'Leite',
        marca: 'Coca-Cola',
        variantes: ['Zero Lactose', 'trad', 'leite', 'COCA COLA', ' ', 'zero lactose'],
        tamanho: { quantidade: 1, unidade: 'L' },
      }),
      'Leite sem medida',
    );
    expect(e.marca).toBe('COCA COLA');
    expect(e.variantes).toEqual(['TRADICIONAL', 'ZEROLACTOSE']);
    expect(e.bloco).toBe('COCA COLA|1L');
  });

  it('o tamanho da descrição vence o da IA; sem tamanho legível usa o da IA', () => {
    const com = etiquetasDaIa(
      ia({ marca: 'Batavo', tamanho: { quantidade: 2000, unidade: 'g' } }),
      'Req Batavo 200g Ligh',
    );
    expect(com.tamanho).toBe('0.2kg');
    const sem = etiquetasDaIa(
      ia({ marca: 'Bauducco', tamanho: { quantidade: 80, unidade: 'g' } }),
      'Bisc Bauducco Choc',
    );
    expect(sem).toMatchObject({ tamanho: '0.08kg', bloco: 'BAUDUCCO|0.08kg' });
    expect(
      etiquetasDaIa(ia({ marca: 'Ovos', tamanho: { quantidade: 30, unidade: 'un' } }), 'Ovos'),
    ).toMatchObject({
      tamanho: '30un',
    });
    expect(
      etiquetasDaIa(ia({ marca: 'X', tamanho: { quantidade: 0, unidade: 'kg' } }), 'X'),
    ).toMatchObject({
      tamanho: null,
      bloco: null,
    });
  });

  it('a granel: GRANEL|TIPO sem marca, MARCA|GRANEL com marca, nada sem os dois', () => {
    expect(etiquetasDaIa(ia({ tipo: 'Cebola', granel: true }), 'FEIRA CEBOLA KG').bloco).toBe(
      'GRANEL|CEBOLA',
    );
    expect(
      etiquetasDaIa(
        ia({ tipo: 'Linguiça', marca: 'Siqueirense', granel: true }),
        'ACG LING FINA SIQUEIRENSE KG',
      ).bloco,
    ).toBe('SIQUEIRENSE|GRANEL');
    expect(etiquetasDaIa(ia({ granel: true }), 'KG').bloco).toBeNull();
  });

  it('sem marca ou sem tamanho (e não a granel) fica sem bloco', () => {
    expect(etiquetasDaIa(ia({ tipo: 'Repolho' }), 'Repolho Verde Un')).toMatchObject({
      tipo: 'REPOLHO',
      marca: null,
      bloco: null,
    });
  });
});
