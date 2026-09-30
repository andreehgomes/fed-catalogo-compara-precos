import type { Produto } from '@shared/model';
import { HOJE_SUGESTAO, notasSugestao } from '../../../testing/fixtures/sugestao/notas';
import {
  ACHOCOLATADO,
  ARROZ,
  AZEITE,
  BANANA,
  CAFE,
  DETERGENTE_1L,
  LEITE,
  PILHA,
  PRODUTOS_SUGESTAO,
} from '../../../testing/fixtures/sugestao/produtos';
import { CompraPessoal, indexarCompras, montarGrupos } from '../notas/detalhe/historico-pessoal';
import {
  CICLO_MIN_DIAS,
  DispensadosSugestao,
  Horizonte,
  ItemDaLista,
  Ocasiao,
  Sugestao,
  agruparPorMaisBarato,
  ciclo,
  confianca,
  contarRecorrentes,
  estadoDaSugestao,
  faixaDePreco,
  intervalos,
  mediana,
  montarCestas,
  ocasioes,
  precoNaQuantidade,
  quantidadeSugerida,
  sugerir,
  textoDaLista,
  totaisDaLista,
  ultimoPorMercado,
} from './sugestao';

const HOJE = HOJE_SUGESTAO;
const DIA = 86_400_000;
const NADA: DispensadosSugestao = { jaTenho: new Map(), nunca: new Set() };

function diasAtras(d: number): string {
  return new Date(HOJE.getTime() - d * DIA).toISOString();
}

function compra(dias: number, extra: Partial<CompraPessoal> = {}): CompraPessoal {
  return {
    chave: `c${dias}`,
    n: 1,
    cnpj: 'A',
    mercado: 'Mercado A',
    emissao: diasAtras(dias),
    produtoId: 'ean:1',
    descricao: 'LEITE 1L',
    qtd: 1,
    unidade: 'UN',
    vlUnit: 5,
    porUnidade: { valor: 5, unidade: 'L' },
    ...extra,
  };
}

/** Da mais recente para a mais antiga, como no índice. */
function serie(dias: number[], extra: Partial<CompraPessoal> = {}): CompraPessoal[] {
  return [...dias].sort((a, b) => a - b).map((d) => compra(d, extra));
}

function oc(dias: number[]): Ocasiao[] {
  return ocasioes(serie(dias));
}

function indiceFixture() {
  const grupos = montarGrupos(
    new Map(PRODUTOS_SUGESTAO.map((p) => [p.id as string, p])) as Map<string, Produto>,
    [],
  );
  return indexarCompras(notasSugestao(), grupos);
}

function porGrupo(s: Sugestao[]) {
  return Object.fromEntries(s.map((x) => [x.grupo, x]));
}

function selecionados(s: Sugestao[], grupos: string[]): ItemDaLista[] {
  return grupos.map((g) => {
    const sugestao = s.find((x) => x.grupo === g)!;
    return { sugestao, quantidade: sugestao.quantidade.valor };
  });
}

describe('ocasioes, ciclo e intervalos', () => {
  it('junta compras com menos de 2 dias e devolve em ordem cronológica', () => {
    const r = ocasioes([
      compra(10, { cnpj: 'B', qtd: 2 }),
      compra(11, { cnpj: 'A' }),
      compra(13),
      compra(20),
    ]);
    expect(r.map((o) => o.compras.length)).toEqual([1, 1, 2]);
    expect(r[2].data).toBe(diasAtras(10));
    expect(intervalos(r)).toEqual([7, 3]);
  });

  it('mediana com número par e ímpar de valores', () => {
    expect(mediana([9, 1, 5])).toBe(5);
    expect(mediana([7, 1, 5, 3])).toBe(4);
    expect(ciclo(oc([0, 7, 14, 30]))).toBe(7);
    expect(ciclo(oc([0, 7, 17]))).toBe(8.5);
  });

  it('piso de 3 dias e null com menos de 2 ocasiões', () => {
    expect(ciclo(oc([0, 2, 4]))).toBe(CICLO_MIN_DIAS);
    expect(ciclo(oc([5]))).toBeNull();
  });
});

describe('estadoDaSugestao', () => {
  it.each<[number, Horizonte, string | null]>([
    [7.9, 'hoje', null],
    [8, 'hoje', 'em-breve'],
    [10, 'hoje', 'repor'],
    [30, 'hoje', 'repor'],
    [30.1, 'hoje', 'parou'],
  ])('atraso %s/10 (%s) → %s', (dias, h, esperado) => {
    expect(estadoDaSugestao(dias, 10, h)).toBe(esperado);
  });

  it('o horizonte antecipa o "em breve"', () => {
    expect(estadoDaSugestao(10, 30, 'hoje')).toBeNull();
    expect(estadoDaSugestao(10, 30, 'semana')).toBeNull();
    expect(estadoDaSugestao(15, 30, 'quinzena')).toBe('em-breve');
    expect(estadoDaSugestao(23, 30, 'semana')).toBe('em-breve');
    expect(estadoDaSugestao(1, 30, 'quinzena')).toBeNull();
    expect(estadoDaSugestao(1, 30, 'mes')).toBe('em-breve');
  });
});

describe('confianca', () => {
  it('pela contagem de ocasiões', () => {
    const cinco = oc([0, 7, 14, 21, 28]);
    expect(confianca(cinco, intervalos(cinco))).toBe('alta');
    const tres = oc([0, 7, 14]);
    expect(confianca(tres, intervalos(tres))).toBe('media');
    const duas = oc([0, 7]);
    expect(confianca(duas, intervalos(duas))).toBe('baixa');
  });

  it('coeficiente de variação acima de 0,6 rebaixa um nível', () => {
    const irregular = oc([0, 3, 40, 43, 90]);
    expect(confianca(irregular, intervalos(irregular))).toBe('media');
    const tres = oc([0, 3, 40]);
    expect(confianca(tres, intervalos(tres))).toBe('baixa');
  });
});

describe('quantidadeSugerida', () => {
  it('2 × 1 L e 1 × 2 L → 2 L', () => {
    const r = quantidadeSugerida(
      ocasioes([
        compra(0, { qtd: 2 }),
        compra(7, { descricao: 'LEITE 2L', vlUnit: 9, porUnidade: { valor: 4.5, unidade: 'L' } }),
        compra(14, { qtd: 3 }),
      ]),
    );
    expect(r).toEqual({ valor: 2, unidade: 'L', base: 'L' });
  });

  it('granel em kg com 3 casas', () => {
    const kg = {
      unidade: 'KG',
      descricao: 'BANANA',
      porUnidade: { valor: 5, unidade: 'kg' as const },
    };
    const r = quantidadeSugerida(
      ocasioes([compra(0, { ...kg, qtd: 1.2449 }), compra(9, { ...kg, qtd: 1.5 })]),
    );
    expect(r).toEqual({ valor: 1.372, unidade: 'kg', base: 'kg' });
  });

  it('sem unidade base em todas: unidade comercial mais frequente, inteira', () => {
    const r = quantidadeSugerida(
      ocasioes([
        compra(0, { descricao: 'PAO FRANCES', qtd: 3, porUnidade: null }),
        compra(7, { descricao: 'PAO FRANCES', qtd: 2, porUnidade: null }),
        compra(14, { descricao: 'PAO FRANCES', unidade: 'KG', qtd: 0.4, porUnidade: null }),
        compra(21, { descricao: 'PAO FRANCES', qtd: 0.2, porUnidade: null }),
      ]),
    );
    expect(r).toEqual({ valor: 2, unidade: 'UN', base: null });
  });

  it('base diferente entre compras cai na unidade comercial', () => {
    const r = quantidadeSugerida(
      ocasioes([compra(0), compra(7, { porUnidade: { valor: 5, unidade: 'kg' } })]),
    );
    expect(r).toEqual({ valor: 1, unidade: 'UN', base: null });
  });
});

describe('faixaDePreco e ultimoPorMercado', () => {
  it('todas iguais: mais barato = mais caro = a mais recente', () => {
    const f = faixaDePreco(serie([0, 7, 14]));
    expect(f.maisBarato.compra.emissao).toBe(diasAtras(0));
    expect(f.maisCaro).toEqual(f.maisBarato);
    expect(f.sufixo).toBe('/un');
  });

  it('compra incomparável fica fora da faixa', () => {
    const f = faixaDePreco([
      compra(20, { vlUnit: 7, cnpj: 'B', mercado: 'Mercado B' }),
      compra(0, {
        unidade: 'KG',
        descricao: 'MAMAO',
        vlUnit: 4,
        porUnidade: { valor: 4, unidade: 'kg' },
      }),
      compra(5, {
        unidade: 'KG',
        descricao: 'MAMAO',
        vlUnit: 6,
        porUnidade: { valor: 6, unidade: 'kg' },
      }),
    ]);
    expect(f).toMatchObject({ base: 'unidade', sufixo: '/kg' });
    expect(f.ultimoPago.valor).toBe(4);
    expect(f.maisBarato.valor).toBe(4);
    expect(f.maisCaro.valor).toBe(6);
  });

  it('último de cada mercado', () => {
    const r = ultimoPorMercado([
      compra(3, { cnpj: 'B', vlUnit: 6 }),
      compra(1, { cnpj: 'A', vlUnit: 5 }),
      compra(9, { cnpj: 'A', vlUnit: 4 }),
      compra(12, { cnpj: 'B', vlUnit: 3 }),
    ]);
    expect([...r].map(([cnpj, c]) => [cnpj, c.vlUnit])).toEqual([
      ['A', 5],
      ['B', 6],
    ]);
  });

  it('preço na unidade da quantidade', () => {
    const c = compra(0, { vlUnit: 10, porUnidade: { valor: 5, unidade: 'L' } });
    expect(precoNaQuantidade({ valor: 2, unidade: 'L', base: 'L' }, c)).toBe(5);
    expect(precoNaQuantidade({ valor: 2, unidade: 'kg', base: 'kg' }, c)).toBeNull();
    expect(precoNaQuantidade({ valor: 2, unidade: 'UN', base: null }, c)).toBe(10);
    expect(precoNaQuantidade({ valor: 2, unidade: 'KG', base: null }, c)).toBeNull();
    expect(
      precoNaQuantidade({ valor: 2, unidade: 'L', base: 'L' }, { ...c, porUnidade: null }),
    ).toBeNull();
  });
});

describe('sugerir (fixture de 12 meses)', () => {
  const indice = indiceFixture();

  it('seções esperadas com horizonte "semana"', () => {
    const s = sugerir(indice, HOJE, 'semana', NADA);
    expect(s.map((x) => [x.grupo, x.estado, x.confianca])).toEqual([
      [LEITE, 'repor', 'alta'],
      [ARROZ, 'repor', 'alta'],
      [BANANA, 'repor', 'alta'],
      [CAFE, 'em-breve', 'alta'],
      [AZEITE, 'em-breve', 'baixa'],
      [ACHOCOLATADO, 'parou', 'alta'],
    ]);
    const g = porGrupo(s);
    expect(g[LEITE]).toMatchObject({ cicloDias: 7, diasDesdeUltima: 9 });
    expect(g[LEITE].quantidade).toEqual({ valor: 2, unidade: 'L', base: 'L' });
    expect(g[LEITE].ocasioes.find((o) => o.compras.length === 2)!.data).toBe(diasAtras(15));
    expect(g[BANANA].quantidade).toEqual({ valor: 1.245, unidade: 'kg', base: 'kg' });
    expect(g[ARROZ].porMercado.size).toBe(2);
    expect(g[ARROZ].descricao).toBe('ARROZ T1 5KG');
    expect(g[CAFE].faixa.maisBarato).toMatchObject({ valor: 15.9 });
    expect(g[CAFE].faixa.maisBarato.compra.mercado).toBe('Mercado Beta');
    expect(g[CAFE].proximaPrevista).toBe(diasAtras(-2));
    expect(s.some((x) => x.grupo === PILHA)).toBe(false);
  });

  it('o horizonte muda o "em breve"', () => {
    const quinzena = sugerir(indice, HOJE, 'quinzena', NADA);
    const detergente = quinzena.find((x) => x.grupo === DETERGENTE_1L)!;
    expect(detergente.estado).toBe('em-breve');
    expect(detergente.faixa).toMatchObject({ base: 'L', sufixo: '/L' });
    expect(detergente.faixa.maisBarato.valor).toBe(5.58);
    expect(detergente.quantidade).toEqual({ valor: 1, unidade: 'L', base: 'L' });
    expect(sugerir(indice, HOJE, 'hoje', NADA).some((x) => x.grupo === DETERGENTE_1L)).toBe(false);
  });

  it('"nunca" some; "já tenho" vale até o ciclo seguinte ou até nova compra', () => {
    const nunca = sugerir(indice, HOJE, 'semana', { jaTenho: new Map(), nunca: new Set([LEITE]) });
    expect(nunca.some((x) => x.grupo === LEITE)).toBe(false);

    const marcado = { jaTenho: new Map([[LEITE, HOJE.toISOString()]]), nunca: new Set<string>() };
    expect(sugerir(indice, HOJE, 'semana', marcado).some((x) => x.grupo === LEITE)).toBe(false);
    const depois = new Date(HOJE.getTime() + 7 * DIA);
    expect(sugerir(indice, depois, 'semana', marcado).some((x) => x.grupo === LEITE)).toBe(true);

    const antesDaCompra = { jaTenho: new Map([[LEITE, diasAtras(10)]]), nunca: new Set<string>() };
    expect(sugerir(indice, HOJE, 'semana', antesDaCompra).some((x) => x.grupo === LEITE)).toBe(
      true,
    );
  });

  it('empates de estado, confiança e atraso ordenam pelo nome', () => {
    const idx = new Map([
      ['b', serie([7, 14, 21], { descricao: 'B' })],
      ['a', serie([7, 14, 21], { descricao: 'A' })],
    ]);
    expect(sugerir(idx, HOJE, 'hoje', NADA).map((x) => x.grupo)).toEqual(['a', 'b']);
  });

  it('fora: uma ocasião só', () => {
    expect(sugerir(new Map([['x', serie([30])]]), HOJE, 'semana', NADA)).toEqual([]);
  });

  it('conta os recorrentes (3 ocasiões ou mais)', () => {
    expect(contarRecorrentes(indice)).toBe(7);
    expect(contarRecorrentes(new Map([['x', serie([1, 9])]]))).toBe(0);
  });
});

describe('totais, agrupamento e cestas', () => {
  const s = sugerir(indiceFixture(), HOJE, 'semana', NADA);
  const itens = selecionados(s, [LEITE, ARROZ, BANANA, CAFE]);

  it('totais da lista completa', () => {
    expect(totaisDaLista(itens)).toEqual({
      comoDaUltimaVez: 60.62,
      noMenorPreco: 54.99,
      economia: 5.62,
      itensComPreco: 4,
      itens: 4,
    });
  });

  it('item sem preço na unidade da quantidade fica fora das somas', () => {
    const [leite] = itens;
    const semBase: ItemDaLista = {
      quantidade: 2,
      sugestao: { ...leite.sugestao, quantidade: { valor: 2, unidade: 'CX', base: null } },
    };
    expect(totaisDaLista([semBase])).toEqual({
      comoDaUltimaVez: 0,
      noMenorPreco: 0,
      economia: 0,
      itensComPreco: 0,
      itens: 1,
    });
  });

  it('cada item no mercado onde saiu mais barato; nenhum item some', () => {
    const g = agruparPorMaisBarato(itens);
    expect(g.map((x) => [x.mercado, x.itens.map((i) => i.grupo), x.total])).toEqual([
      ['Mercado Beta', [ARROZ, CAFE], 39.4],
      ['Mercado Alfa', [LEITE], 9.98],
      ['Mercado Gama', [BANANA], 6.84],
    ]);
    expect(g.flatMap((x) => x.itens)).toHaveLength(itens.length);
  });

  it('mercados com o mesmo total ordenam pelo nome; texto no plural', () => {
    const [leite] = itens;
    const zerado = (grupo: string, cnpj: string, mercado: string): ItemDaLista => ({
      quantidade: 1,
      sugestao: {
        ...leite.sugestao,
        grupo,
        quantidade: { valor: 1, unidade: 'CX', base: null },
        ultimaCompra: { ...leite.sugestao.ultimaCompra, cnpj, mercado },
        porMercado: new Map([[cnpj, { ...leite.sugestao.ultimaCompra, cnpj, mercado }]]),
      },
    });
    const g = agruparPorMaisBarato([zerado('b', 'B', 'Mercado B'), zerado('a', 'A', 'Mercado A')]);
    expect(g.map((x) => x.mercado)).toEqual(['Mercado A', 'Mercado B']);
    expect(textoDaLista('mercado', itens)).toContain('Mercado Beta: 2 itens, R$ 39,40');
  });

  it('sem preço comparável fica no mercado da última compra', () => {
    const [leite] = itens;
    const semBase = {
      quantidade: 1,
      sugestao: { ...leite.sugestao, quantidade: { valor: 1, unidade: 'CX', base: null } },
    };
    const [g] = agruparPorMaisBarato([semBase]);
    expect(g).toMatchObject({ mercado: 'Mercado Alfa', total: 0 });
    expect(g.itens[0]).toMatchObject({ preco: null, subtotal: null });
  });

  it('cestas por cobertura e depois por total', () => {
    const c = montarCestas(itens);
    expect(c.map((x) => [x.mercado, x.cobertos.length, x.total, x.faltando])).toEqual([
      ['Mercado Beta', 3, 49.98, ['BANANA PRATA KG']],
      ['Mercado Alfa', 3, 53.78, ['BANANA PRATA KG']],
      ['Mercado Gama', 1, 6.84, ['LEITE INTEGRAL 1L', 'ARROZ T1 5KG', 'CAFE TORRADO 500G']],
    ]);
    expect(montarCestas(itens, 1)).toHaveLength(1);
  });

  it('com a mesma cobertura, o total compara só os itens comuns; empate pelo nome', () => {
    const mk = (grupo: string, precos: [string, number][]): ItemDaLista => {
      const compras = precos.map(([cnpj, v], i) =>
        compra(i + 1, { cnpj, mercado: `Mercado ${cnpj}`, vlUnit: v, porUnidade: null }),
      );
      return {
        quantidade: 1,
        sugestao: {
          grupo,
          descricao: grupo,
          quantidade: { valor: 1, unidade: 'UN', base: null },
          porMercado: ultimoPorMercado(compras),
        } as unknown as Sugestao,
      };
    };
    const lista = [
      mk('x', [
        ['A', 10],
        ['B', 12],
        ['C', 12],
      ]),
      mk('y', [['A', 50]]),
      mk('z', [
        ['B', 1],
        ['C', 1],
      ]),
    ];
    const c = montarCestas(lista);
    expect(c.map((x) => [x.cnpj, x.total])).toEqual([
      ['A', 60],
      ['B', 13],
      ['C', 13],
    ]);
  });

  it('texto da lista completa e por mercado', () => {
    const dois = itens.slice(2);
    expect(textoDaLista('lista', dois)).toBe(
      [
        'Lista de compras · Cupom Esperto',
        '',
        '- BANANA PRATA KG (≈ 1,245 kg): última vez R$ 5,49/kg no Mercado Gama em 19/09; ' +
          'mais barato R$ 4,99/kg no Mercado Gama',
        '- CAFE TORRADO 500G (≈ 0,5 kg): última vez R$ 18,90/un no Mercado Alfa em 17/09; ' +
          'mais barato R$ 15,90/un no Mercado Beta',
        '',
        'Como da última vez: R$ 25,74',
        'No seu menor preço: R$ 22,11',
      ].join('\n'),
    );
    const leite = selecionados(s, [LEITE]);
    expect(textoDaLista('lista', leite)).toContain(
      'última vez R$ 4,99/un no Mercado Alfa em 20/09\n',
    );
    const semBase: ItemDaLista = {
      quantidade: 1,
      sugestao: { ...leite[0].sugestao, quantidade: { valor: 1, unidade: 'CX', base: null } },
    };
    expect(textoDaLista('mercado', [...dois, semBase])).toBe(
      [
        'Lista de compras · Cupom Esperto',
        '',
        'Mercado Beta: 1 item, R$ 16,50',
        '- CAFE TORRADO 500G (≈ 0,5 kg): R$ 16,50',
        '',
        'Mercado Gama: 1 item, R$ 6,84',
        '- BANANA PRATA KG (≈ 1,245 kg): R$ 6,84',
        '',
        'Mercado Alfa: 1 item, R$ 0,00',
        '- LEITE INTEGRAL 1L (≈ 1 CX)',
      ].join('\n'),
    );
  });
});
