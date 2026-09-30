import type { ItemNota, Nota, Produto } from '@shared/model';
import { CAFE_EAN, COCA_2L_EAN, gruposDaLista } from '../../../testing/fixtures/lista/grupos';
import {
  itemLista,
  itensDaListaFixture,
  listaCompras,
} from '../../../testing/fixtures/lista/lista';
import { CHAVE_LISTA, DELTA, locDelta, notaDaLista } from '../../../testing/fixtures/lista/nota';
import { HOJE_SUGESTAO, notasSugestao } from '../../../testing/fixtures/sugestao/notas';
import { LEITE, PRODUTOS_SUGESTAO } from '../../../testing/fixtures/sugestao/produtos';
import {
  CompraPessoal,
  consolidarItens,
  indexarCompras,
  montarGrupos,
} from '../notas/detalhe/historico-pessoal';
import { sugerir } from '../sugestoes/sugestao';
import {
  LIGA_POR_TEXTO,
  MAX_ITENS,
  PERGUNTA_POR_TEXTO,
  alternarAdicionado,
  autocompletar,
  comAjustes,
  confirmarPar,
  contadores,
  desfazerPar,
  faltantes,
  itemDe,
  ligarManual,
  planejarAdicao,
  podeLerOutraNota,
  chaveDoItem,
  compraConferida,
  conciliar,
  estimativa,
  gruposAprendidos,
  itemDaNota,
  itemDoHistorico,
  itemDoProduto,
  itensDaSugestao,
  limitarQuantidade,
  limparTexto,
  mesclarItem,
  nomePadrao,
  planoDeFinalizacao,
  precoDeReferencia,
  progresso,
  resumoDaConferencia,
  rotuloQuantidade,
  scoreDeTexto,
  separar,
  textoDaLista,
  vinculoDe,
  type ItemNovo,
} from './lista';

function compra(extra: Partial<CompraPessoal> = {}): CompraPessoal {
  return {
    chave: 'c1',
    n: 1,
    cnpj: 'A',
    mercado: 'Mercado A',
    emissao: '2026-09-20T15:00:00.000Z',
    produtoId: 'ean:1',
    descricao: 'LEITE INTEGRAL 1L',
    qtd: 2,
    unidade: 'UN',
    vlUnit: 4.99,
    porUnidade: { valor: 4.99, unidade: 'L' },
    ...extra,
  };
}

function novo(extra: Partial<ItemNovo> = {}): ItemNovo {
  return {
    texto: 'leite',
    grupo: null,
    quantidade: null,
    unidade: null,
    base: null,
    origem: 'manual',
    ...extra,
  };
}

function itemNota(n: number, descricao: string, extra: Partial<ItemNota> = {}): ItemNota {
  return {
    n,
    descricao,
    codigo: String(n),
    ean: null,
    qtd: 1,
    unidade: 'UN',
    vlUnit: 5,
    vlTotal: 5,
    produtoId: locDelta(String(n)),
    precoPorUnidadeBase: null,
    ...extra,
  };
}

function nota(itens: ItemNota[]): Nota {
  return notaDaLista({ itens, total: itens.reduce((s, i) => s + i.vlTotal, 0) });
}

function indiceSugestao() {
  const grupos = montarGrupos(
    new Map(PRODUTOS_SUGESTAO.map((p) => [p.id as string, p])) as Map<string, Produto>,
    [],
  );
  return indexarCompras(notasSugestao(), grupos);
}

describe('textos e quantidades', () => {
  it('limpa espaços e corta em 80', () => {
    expect(limparTexto('  leite   integral ')).toBe('leite integral');
    expect(limparTexto('x'.repeat(90))).toHaveLength(80);
  });

  it('quantidade inválida vira null; acima de 999 é cortada; 3 casas', () => {
    expect(limitarQuantidade(null)).toBeNull();
    expect(limitarQuantidade(undefined)).toBeNull();
    expect(limitarQuantidade(0)).toBeNull();
    expect(limitarQuantidade(Number.NaN)).toBeNull();
    expect(limitarQuantidade(1500)).toBe(999);
    expect(limitarQuantidade(1.23456)).toBe(1.235);
  });

  it('chave pelo grupo, senão pelo texto normalizado', () => {
    expect(chaveDoItem({ grupo: 'ean:1', texto: 'x' })).toBe('ean:1');
    expect(chaveDoItem({ grupo: null, texto: 'Pão Francês' })).toBe('PAO FRANCES');
  });

  it('rótulo da quantidade', () => {
    expect(rotuloQuantidade({ quantidade: null, unidade: 'un' })).toBe('');
    expect(rotuloQuantidade({ quantidade: 6, unidade: 'UN' })).toBe('6 un');
    expect(rotuloQuantidade({ quantidade: 1.5, unidade: 'kg' })).toBe('1,5 kg');
    expect(rotuloQuantidade({ quantidade: 2, unidade: 'L' })).toBe('2 L');
    expect(rotuloQuantidade({ quantidade: 3, unidade: null })).toBe('3');
  });

  it('nome padrão com dia e mês', () => {
    expect(nomePadrao(new Date(2026, 8, 3, 10))).toBe('Compras de 03/09');
  });
});

describe('mesclarItem', () => {
  const existentes = [
    itemLista('a', { texto: 'Leite integral', grupo: 'ean:1', quantidade: 2, unidade: 'UN' }),
    itemLista('b', { texto: 'Pão francês', quantidade: null }),
    itemLista('c', { texto: 'Arroz', quantidade: 5, unidade: 'kg', base: 'kg' }),
    itemLista('d', {
      texto: 'Molho',
      vinculo: vinculoDe({ nota: itemNota(1, 'MOLHO'), como: 'texto' }, notaDaLista()),
    }),
  ];

  it('mesmo grupo e mesma unidade soma', () => {
    expect(mesclarItem(existentes, novo({ grupo: 'ean:1', quantidade: 3, unidade: 'un' }))).toEqual(
      {
        tipo: 'somar',
        id: 'a',
        quantidade: 5,
        unidade: 'UN',
        base: null,
      },
    );
  });

  it('unidade diferente vira item novo', () => {
    expect(mesclarItem(existentes, novo({ grupo: 'ean:1', quantidade: 1, unidade: 'CX' }))).toEqual(
      {
        tipo: 'novo',
      },
    );
  });

  it('texto normalizado igual (acento e caixa) soma; em branco dos dois lados vira 2', () => {
    expect(mesclarItem(existentes, novo({ texto: 'PAO FRANCES' }))).toMatchObject({
      tipo: 'somar',
      id: 'b',
      quantidade: 2,
    });
  });

  it('um lado em branco: vale a quantidade informada, com a unidade dela', () => {
    expect(
      mesclarItem(existentes, novo({ texto: 'pão francês', quantidade: 10, unidade: 'un' })),
    ).toEqual({
      tipo: 'somar',
      id: 'b',
      quantidade: 10,
      unidade: 'un',
      base: null,
    });
    expect(mesclarItem(existentes, novo({ texto: 'arroz' }))).toEqual({
      tipo: 'somar',
      id: 'c',
      quantidade: 5,
      unidade: 'kg',
      base: 'kg',
    });
  });

  it('grupos diferentes com o mesmo texto não se misturam; item já ligado não recebe soma', () => {
    expect(mesclarItem(existentes, novo({ texto: 'Leite integral', grupo: 'ean:2' }))).toEqual({
      tipo: 'novo',
    });
    expect(mesclarItem(existentes, novo({ texto: 'Leite integral' }))).toMatchObject({ id: 'a' });
    expect(mesclarItem(existentes, novo({ texto: 'molho' }))).toEqual({ tipo: 'novo' });
  });

  it('soma respeita o limite de 999', () => {
    const cheio = [itemLista('x', { texto: 'x', quantidade: 998, unidade: 'un' })];
    expect(mesclarItem(cheio, novo({ texto: 'x', quantidade: 5, unidade: 'un' }))).toMatchObject({
      quantidade: 999,
    });
  });
});

describe('itens de outras telas', () => {
  it('da sugestão: grupo, descrição cortada, quantidade ajustada e unidade da sugestão', () => {
    const [leite] = sugerir(indiceSugestao(), HOJE_SUGESTAO, 'semana', {
      jaTenho: new Map(),
      nunca: new Set(),
    }).filter((s) => s.grupo === LEITE);
    const longa = { ...leite, descricao: 'L'.repeat(100) };
    expect(
      itensDaSugestao([
        { sugestao: leite, quantidade: 3 },
        { sugestao: longa, quantidade: 0 },
      ]),
    ).toEqual([
      {
        texto: 'LEITE INTEGRAL 1L',
        grupo: LEITE,
        quantidade: 3,
        unidade: leite.quantidade.unidade,
        base: leite.quantidade.base,
        origem: 'sugestao',
      },
      expect.objectContaining({ texto: 'L'.repeat(80), quantidade: null }),
    ]);
  });

  it('do produto: grupo canônico', () => {
    const base = { id: 'loc:1:A' as const, descricao: 'ARROZ 5KG' };
    expect(itemDoProduto({ ...base, vinculadoA: 'ean:9' })).toMatchObject({
      grupo: 'ean:9',
      texto: 'ARROZ 5KG',
      origem: 'produto',
      quantidade: null,
    });
    expect(itemDoProduto({ ...base, vinculadoA: null }).grupo).toBe('loc:1:A');
  });

  it('do histórico: descrição mais recente e quantidade habitual', () => {
    const compras = indiceSugestao().get(LEITE)!;
    expect(itemDoHistorico(LEITE, compras)).toEqual({
      texto: 'LEITE INTEGRAL 1L',
      grupo: LEITE,
      quantidade: 2,
      unidade: 'UN',
      base: null,
      origem: 'historico',
    });
  });

  it('da nota: quantidade e unidade da nota', () => {
    expect(
      itemDaNota(itemNota(1, 'BANANA PRATA KG', { qtd: 1.235, unidade: 'kg' }), 'loc:x'),
    ).toEqual({
      texto: 'BANANA PRATA KG',
      grupo: 'loc:x',
      quantidade: 1.235,
      unidade: 'KG',
      base: null,
      origem: 'nota',
    });
    expect(itemDaNota(itemNota(2, 'X', { unidade: ' ' }), 'g').unidade).toBeNull();
  });
});

describe('uso no mercado', () => {
  const itens = [
    itemLista('a', { ordem: 3 }),
    itemLista('b', { ordem: 1, marcado: true, marcadoEm: '2026-09-28T10:00:00.000Z' }),
    itemLista('c', { ordem: 2 }),
    itemLista('d', { ordem: 4, marcado: true, marcadoEm: '2026-09-28T11:00:00.000Z' }),
    itemLista('e', { ordem: 5, marcado: true }),
    itemLista('f', { ordem: 0, marcado: true, marcadoEm: '2026-09-28T10:00:00.000Z' }),
    itemLista('g', { ordem: 6, marcado: true }),
  ];

  it('pendentes pela ordem; carrinho pelo último marcado', () => {
    const s = separar(itens);
    expect(s.pendentes.map((i) => i.id)).toEqual(['c', 'a']);
    expect(s.noCarrinho.map((i) => i.id)).toEqual(['d', 'f', 'b', 'e', 'g']);
    expect(progresso(itens)).toEqual({ marcados: 5, total: 7 });
  });

  it('compra conferida: nota na lista ou todos ligados', () => {
    const v = vinculoDe({ nota: itemNota(1, 'X'), como: 'texto' }, notaDaLista());
    expect(compraConferida(listaCompras(), itens)).toBe(false);
    expect(compraConferida(listaCompras(), [])).toBe(false);
    expect(compraConferida(listaCompras({ notas: [CHAVE_LISTA] }), [])).toBe(true);
    expect(compraConferida(listaCompras(), [itemLista('x', { vinculo: v })])).toBe(true);
  });

  it('texto para compartilhar só com os pendentes', () => {
    const lista = [
      itemLista('a', { texto: 'Leite integral', quantidade: 6, unidade: 'UN', ordem: 1 }),
      itemLista('b', { texto: 'Banana', ordem: 2 }),
      itemLista('c', { texto: 'Café', marcado: true }),
    ];
    expect(textoDaLista({ nome: 'Compras de 30/09' }, lista)).toBe(
      'Compras de 30/09 · Cupom Esperto\n\n- Leite integral (6 un)\n- Banana',
    );
  });
});

describe('preço de referência e estimativa', () => {
  const indice = new Map<string, CompraPessoal[]>([
    ['ean:1', [compra()]],
    [
      'ean:2',
      [
        compra({
          descricao: 'BANANA KG',
          unidade: 'KG',
          vlUnit: 6.5,
          porUnidade: { valor: 6.5, unidade: 'kg' },
        }),
      ],
    ],
    ['ean:3', [compra({ descricao: 'OVOS 30UN', unidade: 'CX', vlUnit: 18, porUnidade: null })]],
    ['ean:4', []],
  ]);

  it('sem grupo ou sem compra: sem preço', () => {
    expect(precoDeReferencia(itemLista('a'), indice)).toBeNull();
    expect(precoDeReferencia(itemLista('a', { grupo: 'ean:9' }), indice)).toBeNull();
    expect(precoDeReferencia(itemLista('a', { grupo: 'ean:4' }), indice)).toBeNull();
  });

  it('na unidade base, na unidade comercial ou, sem unidade, o preço unitário', () => {
    const r = (extra: Parameters<typeof itemLista>[1]) =>
      precoDeReferencia(itemLista('a', extra), indice)?.valor ?? null;
    expect(r({ grupo: 'ean:2', quantidade: 1.5, unidade: 'kg', base: 'kg' })).toBe(6.5);
    expect(r({ grupo: 'ean:2', quantidade: 1, unidade: 'L', base: 'L' })).toBeNull();
    expect(r({ grupo: 'ean:3', quantidade: 2, unidade: 'cx' })).toBe(18);
    expect(r({ grupo: 'ean:3', quantidade: 2, unidade: 'un' })).toBeNull();
    expect(r({ grupo: 'ean:1' })).toBe(4.99);
  });

  it('estimativa soma pendentes e marcados com preço e conta os sem preço', () => {
    const itens = [
      itemLista('leite', { grupo: 'ean:1', quantidade: 6, unidade: 'UN' }),
      itemLista('banana', {
        grupo: 'ean:2',
        quantidade: 1.5,
        unidade: 'kg',
        base: 'kg',
        marcado: true,
      }),
      itemLista('ovos', { grupo: 'ean:3' }),
      itemLista('pao', { texto: 'pão' }),
      itemLista('arroz', { grupo: 'ean:2', quantidade: 1, unidade: 'L', base: 'L' }),
    ];
    expect(estimativa(itens, indice)).toEqual({ total: 57.69, comPreco: 3, semPreco: 2 });
    expect(estimativa([], indice)).toEqual({ total: 0, comPreco: 0, semPreco: 0 });
  });
});

describe('autocompletar', () => {
  const indice = indiceSugestao();

  it('"leite" acha o leite do histórico, com a quantidade habitual', () => {
    const r = autocompletar('leite', indice);
    expect(r[0]).toEqual({
      grupo: LEITE,
      descricao: 'LEITE INTEGRAL 1L',
      quantidade: { valor: 2, unidade: 'UN', base: null },
    });
  });

  it('casa pelo começo da palavra enquanto digita', () => {
    expect(autocompletar('deter', indice).map((s) => s.descricao)).toEqual([
      'DETERGENTE LIQUIDO 1L',
    ]);
  });

  it('texto curto, só medida ou sem nada parecido: nada', () => {
    expect(autocompletar('l', indice)).toEqual([]);
    expect(autocompletar(' 2l ', indice)).toEqual([]);
    expect(autocompletar('parafuso', indice)).toEqual([]);
    expect(autocompletar('leite', new Map([['x', []]]))).toEqual([]);
  });

  it('até 5 sugestões; empate pela quantidade de compras', () => {
    const muitas = new Map<string, CompraPessoal[]>(
      Array.from({ length: 7 }, (_, i) => [
        `g${i}`,
        Array.from({ length: i + 1 }, () => compra({ descricao: `SABAO MARCA${i}` })),
      ]),
    );
    expect(autocompletar('sabao', muitas).map((s) => s.grupo)).toEqual([
      'g6',
      'g5',
      'g4',
      'g3',
      'g2',
    ]);
    const empate = new Map([
      ['b', [compra({ descricao: 'SABAO BB' })]],
      ['a', [compra({ descricao: 'SABAO AA' })]],
    ]);
    expect(autocompletar('sabao', empate).map((s) => s.grupo)).toEqual(['a', 'b']);
    const parecidos = new Map([
      ['liquido', [compra({ descricao: 'SABAO LIQUIDO OMO' })]],
      ['po', [compra({ descricao: 'SABAO PO' })]],
    ]);
    expect(autocompletar('sabao po', parecidos).map((s) => s.grupo)).toEqual(['po', 'liquido']);
  });
});

describe('conciliar (fixture real)', () => {
  const lista = itensDaListaFixture();
  const n = notaDaLista();
  const c = conciliar(lista, n, gruposDaLista());
  const par = (p: { item: { id: string }; nota: ItemNota; como: string }) =>
    `${p.item.id} ↔ ${p.nota.descricao} (${p.como})`;

  it('calibração D-04: texto da lista × melhor descrição da nota × score', () => {
    const daNota = consolidarItens(n.itens);
    const melhor = (texto: string) => {
      const [top] = daNota
        .map((i) => ({
          d: i.descricao,
          s: Math.round(scoreDeTexto(texto, i.descricao) * 100) / 100,
        }))
        .sort((a, b) => b.s - a.s);
      return `${texto} × ${top.d} = ${top.s}`;
    };
    expect(
      ['detergente', 'papel higiênico', 'leite', 'pão francês', 'coca 2l', 'banana'].map(melhor),
    ).toEqual([
      'detergente × Det Ype 500ml Coco = 0.33',
      'papel higiênico × Pap Hig Duetto 12r p = 0.67',
      'leite × Leite Lider 1l Desn = 0.33',
      'pão francês × Pao Wickbold 270g Or = 0.25',
      'coca 2l × Refr Coca Cola 200ml = 0.33',
      'banana × Cerv Therez 500ml Go = 0',
    ]);
    expect(LIGA_POR_TEXTO).toBeCloseTo(0.333, 3);
    expect(PERGUNTA_POR_TEXTO).toBe(0.2);
  });

  it('liga por grupo o item do histórico e por texto os óbvios', () => {
    expect(c.comprados.map(par)).toEqual([
      'cafe ↔ Cafe Itamaraty 500g (grupo)',
      'detergente ↔ Det Ype 500ml Coco (texto)',
      'papel ↔ Pap Hig Duetto 12r p (texto)',
    ]);
    const cafe = c.comprados[0];
    expect([cafe.nota.qtd, cafe.nota.vlTotal, cafe.score]).toEqual([3, 59.97, 1]);
  });

  it('dois candidatos ou score baixo vão para "Confirme"; conteúdo diferente não liga', () => {
    expect(c.confirme.map(par)).toEqual([
      'leite ↔ Leite Lider 1l Desn (texto)',
      'pao ↔ Pao Trad Minas 1kg (texto)',
      'coca ↔ Refr Coca Cola 2l Ze (texto)',
    ]);
  });

  it('faltou e fora da lista; item já ligado é ignorado; cada item da nota uma vez', () => {
    expect(c.faltou.map((i) => i.id)).toEqual(['banana']);
    const usados = [...c.comprados, ...c.confirme].map((p) => p.nota.n);
    expect(new Set(usados).size).toBe(usados.length);
    expect(c.foraDaLista.some((i) => usados.includes(i.n))).toBe(false);
    expect(c.foraDaLista[0]).toMatchObject({ descricao: 'Des Rexona 50ml Form', qtd: 5 });
    expect(c.foraDaLista.length + usados.length).toBe(consolidarItens(n.itens).length);
    expect([...c.comprados, ...c.confirme].some((p) => p.item.id === 'molho')).toBe(false);
  });

  it('totais batem com a soma dos itens', () => {
    const r = resumoDaConferencia(c, n);
    expect(r).toEqual({
      total: n.total,
      daLista: 119.85,
      qtdDaLista: 3,
      foraDaLista: Math.round((n.total - 119.85) * 100) / 100,
      qtdForaDaLista: consolidarItens(n.itens).length - 3,
      qtdFaltou: 1,
    });
  });
});

describe('conciliar (casos)', () => {
  it('"leite integral" liga a "LEITE UHT INT ITALAC 1L"; "arroz 5kg" não liga a "ARROZ 1KG"', () => {
    const c = conciliar(
      [
        itemLista('leite', { texto: 'leite integral' }),
        itemLista('arroz', { texto: 'arroz 5kg', ordem: 2 }),
      ],
      nota([itemNota(1, 'LEITE UHT INT ITALAC 1L'), itemNota(2, 'ARROZ TIO JOAO 1KG')]),
      new Map(),
    );
    expect(c.comprados.map((p) => [p.item.id, p.nota.n, p.como])).toEqual([['leite', 1, 'texto']]);
    expect(c.faltou.map((i) => i.id)).toEqual(['arroz']);
  });

  it('por grupo escolhe o de maior valor e resolve grupo antigo pelo canônico', () => {
    const c = conciliar(
      [
        itemLista('coca', { texto: 'coca', grupo: locDelta('33') }),
        itemLista('outra', { texto: 'coca zero', grupo: COCA_2L_EAN, ordem: 2 }),
        itemLista('sem', { texto: 'cafe', grupo: CAFE_EAN, ordem: 3 }),
      ],
      nota([
        itemNota(1, 'REFR COCA COLA 2L', { produtoId: locDelta('33'), vlTotal: 10 }),
        itemNota(2, 'REFR COCA COLA 2L ZERO', { produtoId: COCA_2L_EAN, vlTotal: 20 }),
      ]),
      new Map([
        [locDelta('33'), COCA_2L_EAN],
        [COCA_2L_EAN, COCA_2L_EAN],
      ]),
    );
    expect(c.comprados.map((p) => [p.item.id, p.nota.n])).toEqual([
      ['coca', 2],
      ['outra', 1],
    ]);
    expect(c.faltou.map((i) => i.id)).toEqual(['sem']);
  });

  it('empate de score: o de maior valor fica e o item vai para "Confirme"', () => {
    const c = conciliar(
      [itemLista('pao', { texto: 'pão' })],
      nota([itemNota(1, 'PAO FORMA', { vlTotal: 8 }), itemNota(2, 'PAO QUEIJO', { vlTotal: 12 })]),
      new Map(),
    );
    expect(c.confirme.map((p) => p.nota.n)).toEqual([2]);
    expect(c.foraDaLista.map((i) => i.n)).toEqual([1]);
  });

  it('mesmo score e mesmo item da nota: fica o item que veio antes na lista', () => {
    const c = conciliar(
      [itemLista('a', { texto: 'pão', ordem: 2 }), itemLista('b', { texto: 'pao', ordem: 1 })],
      nota([itemNota(1, 'PAO FORMA')]),
      new Map(),
    );
    expect(c.comprados.map((p) => p.item.id)).toEqual(['b']);
    expect(c.faltou.map((i) => i.id)).toEqual(['a']);
  });

  it('abaixo de PERGUNTA_POR_TEXTO fica de fora', () => {
    const c = conciliar(
      [itemLista('a', { texto: 'sabao' })],
      nota([itemNota(1, 'SABAO PO OMO LAVAGEM PERFEITA MULTIUSO CAIXA')]),
      new Map(),
    );
    expect(c.confirme).toEqual([]);
    expect(c.faltou).toHaveLength(1);
  });
});

describe('vínculo, grupos aprendidos e finalização', () => {
  const n = notaDaLista();
  const cafe = consolidarItens(n.itens).find((i) => i.descricao.startsWith('Cafe'))!;

  it('vínculo é um retrato do item da nota', () => {
    expect(vinculoDe({ nota: cafe, como: 'grupo' }, n)).toEqual({
      chave: CHAVE_LISTA,
      n: cafe.n,
      produtoId: locDelta('015'),
      descricao: 'Cafe Itamaraty 500g',
      qtd: 3,
      unidade: 'UN',
      vlTotal: 59.97,
      cnpj: DELTA.cnpj,
      mercado: DELTA.nome,
      como: 'grupo',
    });
  });

  it('só o item digitado aprende o grupo (canônico)', () => {
    const pares = [
      { item: itemLista('a'), nota: cafe, como: 'texto' as const, score: 0.5 },
      { item: itemLista('b', { grupo: 'ean:x' }), nota: cafe, como: 'grupo' as const, score: 1 },
    ];
    expect([...gruposAprendidos(pares, gruposDaLista())]).toEqual([['a', CAFE_EAN]]);
  });

  const agora = '2026-09-30T12:00:00.000Z';
  const v = vinculoDe({ nota: cafe, como: 'grupo' }, n);
  const itens = [
    itemLista('comprado', { marcado: true, marcadoEm: agora, vinculo: v }),
    itemLista('marcado', { marcado: true, marcadoEm: agora }),
    itemLista('faltou'),
  ];
  const lista = listaCompras({
    notas: [CHAVE_LISTA],
    qtdItens: 3,
    qtdMarcados: 2,
    ultimaCompraEm: '2026-08-01T00:00:00.000Z',
  });

  it('excluir apaga itens e a lista (lista vazia: só a lista)', () => {
    expect(planoDeFinalizacao('excluir', lista, itens, agora)).toEqual([
      { tipo: 'delete', itemId: 'comprado' },
      { tipo: 'delete', itemId: 'marcado' },
      { tipo: 'delete', itemId: 'faltou' },
      { tipo: 'delete', itemId: null },
    ]);
    expect(planoDeFinalizacao('excluir', lista, [], agora)).toEqual([
      { tipo: 'delete', itemId: null },
    ]);
  });

  it('guardar desmarca e limpa vínculos, com "última compra em"', () => {
    const ops = planoDeFinalizacao('guardar', lista, itens, agora);
    expect(ops).toHaveLength(4);
    expect(ops[0]).toEqual({
      tipo: 'update',
      itemId: 'comprado',
      dados: { marcado: false, marcadoEm: null, vinculo: null },
    });
    expect(ops[3]).toEqual({
      tipo: 'update',
      itemId: null,
      dados: {
        status: 'aberta',
        notas: [],
        pendentes: [],
        qtdMarcados: 0,
        atualizadaEm: agora,
        ultimaCompraEm: agora,
      },
    });
  });

  it('só o que faltou apaga comprados e marcados; sem faltantes recusa', () => {
    expect(planoDeFinalizacao('so-faltou', lista, itens, agora)).toEqual([
      { tipo: 'delete', itemId: 'comprado' },
      { tipo: 'delete', itemId: 'marcado' },
      {
        tipo: 'update',
        itemId: null,
        dados: {
          status: 'aberta',
          notas: [],
          pendentes: [],
          qtdMarcados: 0,
          atualizadaEm: agora,
          qtdItens: 1,
          ultimaCompraEm: '2026-08-01T00:00:00.000Z',
        },
      },
    ]);
    expect(() => planoDeFinalizacao('so-faltou', lista, itens.slice(0, 2), agora)).toThrow();
  });
});

describe('adição e contadores', () => {
  it('item novo: texto limpo, quantidade limitada, sem unidade quando sem quantidade', () => {
    expect(
      itemDe(novo({ texto: '  Leite  ', quantidade: 0, unidade: 'un', base: 'un' }), 3),
    ).toEqual({
      texto: 'Leite',
      grupo: null,
      quantidade: null,
      unidade: null,
      base: null,
      origem: 'manual',
      ordem: 3,
      marcado: false,
      marcadoEm: null,
      vinculo: null,
    });
    expect(itemDe(novo({ quantidade: 2, unidade: 'kg', base: 'kg' }), 1)).toMatchObject({
      quantidade: 2,
      unidade: 'kg',
      base: 'kg',
    });
  });

  it('soma no existente, soma repetidos entre os novos e continua a ordem', () => {
    const existentes = [itemLista('a', { texto: 'Leite', quantidade: 2, unidade: 'un', ordem: 7 })];
    const r = planejarAdicao(existentes, [
      novo({ texto: 'leite', quantidade: 1, unidade: 'un' }),
      novo({ texto: 'Banana' }),
      novo({ texto: 'banana' }),
      novo({ texto: 'Café', quantidade: 1, unidade: 'un' }),
    ]);
    expect([...r.somar]).toEqual([['a', { quantidade: 3, unidade: 'un', base: null }]]);
    expect(r.novos.map((i) => [i.texto, i.quantidade, i.ordem])).toEqual([
      ['Banana', 2, 8],
      ['Café', 1, 9],
    ]);
    expect(r.foraDoLimite).toBe(0);
    expect(planejarAdicao([], [novo()]).novos[0].ordem).toBe(1);
  });

  it(`corta em ${MAX_ITENS} itens`, () => {
    const cheia = Array.from({ length: MAX_ITENS - 1 }, (_, i) =>
      itemLista(`i${i}`, { texto: `x${i}` }),
    );
    const r = planejarAdicao(cheia, [
      novo({ texto: 'a' }),
      novo({ texto: 'b' }),
      novo({ texto: 'x1' }),
    ]);
    expect(r.novos.map((i) => i.texto)).toEqual(['a']);
    expect(r.foraDoLimite).toBe(1);
    expect(r.somar.has('i1')).toBe(true);
  });

  it('contadores, faltantes e "ler outra nota"', () => {
    const v = vinculoDe({ nota: itemNota(1, 'X'), como: 'texto' }, notaDaLista());
    const itens = [
      itemLista('a', { marcado: true }),
      itemLista('b', { vinculo: v }),
      itemLista('c'),
    ];
    expect(contadores(itens)).toEqual({ qtdItens: 3, qtdMarcados: 1 });
    expect(faltantes(itens).map((i) => i.id)).toEqual(['c']);
    expect(podeLerOutraNota(listaCompras({ notas: ['1', '2'] }), itens)).toBe(true);
    expect(podeLerOutraNota(listaCompras({ notas: ['1', '2', '3'] }), itens)).toBe(false);
    expect(podeLerOutraNota(listaCompras(), itens.slice(0, 2))).toBe(false);
  });
});

describe('ajustes da conferência', () => {
  const base = () =>
    comAjustes(
      conciliar(
        [
          itemLista('leite', { texto: 'leite', ordem: 1 }),
          itemLista('cafe', { texto: 'cafe', ordem: 2 }),
          itemLista('arroz', { texto: 'arroz', ordem: 3 }),
        ],
        nota([
          itemNota(1, 'LEITE LIDER DESN', { vlTotal: 5 }),
          itemNota(2, 'LEITE MOLICO ZERO', { vlTotal: 8 }),
          itemNota(3, 'CAFE PILAO', { vlTotal: 20 }),
          itemNota(4, 'SABAO OMO', { vlTotal: 30 }),
        ]),
        new Map(),
      ),
    );

  it('ponto de partida: comprados, confirme, faltou e fora', () => {
    const c = base();
    expect(c.comprados.map((p) => p.item.id)).toEqual(['cafe']);
    expect(c.confirme.map((p) => [p.item.id, p.nota.n])).toEqual([['leite', 2]]);
    expect(c.faltou.map((i) => i.id)).toEqual(['arroz']);
    expect(c.foraDaLista.map((i) => i.n)).toEqual([4, 1]);
    expect(c.adicionados).toEqual([]);
  });

  it('"Sim" confirma; "Não" e "Não é este" devolvem os dois lados', () => {
    const sim = confirmarPar(base(), 'leite');
    expect(sim.comprados.map((p) => p.item.id)).toEqual(['leite', 'cafe']);
    expect(sim.confirme).toEqual([]);
    expect(confirmarPar(sim, 'leite')).toBe(sim);

    const nao = desfazerPar(sim, 'cafe');
    expect(nao.comprados.map((p) => p.item.id)).toEqual(['leite']);
    expect(nao.faltou.map((i) => i.id)).toEqual(['cafe', 'arroz']);
    expect(nao.foraDaLista.map((i) => i.n)).toEqual([4, 3, 1]);
    expect(desfazerPar(nao, 'nenhum')).toBe(nao);
    expect(desfazerPar(base(), 'leite').confirme).toEqual([]);
  });

  it('ligar à mão e acrescentar item de fora; resumo conta os acrescentados', () => {
    let c = ligarManual(base(), 'arroz', 1);
    expect(c.comprados.map((p) => [p.item.id, p.nota.n, p.como])).toEqual([
      ['cafe', 3, 'texto'],
      ['arroz', 1, 'manual'],
    ]);
    expect(ligarManual(c, 'arroz', 4)).toBe(c);
    expect(ligarManual(c, 'x', 4)).toBe(c);

    c = alternarAdicionado(c, 4);
    expect(c.adicionados.map((i) => i.n)).toEqual([4]);
    expect(c.foraDaLista).toEqual([]);
    expect(resumoDaConferencia(c, { total: 63 }, c.adicionados)).toEqual({
      total: 63,
      daLista: 55,
      qtdDaLista: 3,
      foraDaLista: 8,
      qtdForaDaLista: 1,
      qtdFaltou: 0,
    });
    expect(alternarAdicionado(c, 99)).toBe(c);
    c = alternarAdicionado(c, 4);
    expect(c.adicionados).toEqual([]);
    expect(c.foraDaLista.map((i) => i.n)).toEqual([4]);
  });
});
