import type { ItemNota, Nota, Produto } from '@shared/model';
import notasJson from '../../../../testing/fixtures/notas-historico/notas.json';
import produtosJson from '../../../../testing/fixtures/notas-historico/produtos.json';
import {
  CompraPessoal,
  ComparacaoHistorico,
  baseComum,
  compararItem,
  compararNota,
  comValores,
  consolidarItens,
  contarPorFiltro,
  destaques,
  filtrarItens,
  indexarCompras,
  montarGrupos,
  resumirHistorico,
  unidadeNormalizada,
} from './historico-pessoal';

const NOTAS = notasJson as Nota[];
const PRODUTOS = produtosJson as Produto[];
const [N1, N2, ATUAL, POSTERIOR] = NOTAS;
const A = '03644587000836';
const B = '11222333000181';

function gruposDaNota(nota: Nota) {
  const porId = new Map(PRODUTOS.map((p) => [p.id as string, p]));
  const daNota = new Map(
    nota.itens.flatMap((i) =>
      porId.has(i.produtoId) ? [[i.produtoId, porId.get(i.produtoId)!]] : [],
    ),
  ) as Map<string, Produto>;
  const canonicos = new Set([...daNota.values()].map((p) => p.vinculadoA ?? p.id));
  const membros = PRODUTOS.filter((p) => p.vinculadoA && canonicos.has(p.vinculadoA));
  return montarGrupos(daNota, membros);
}

function compararAtual(): Map<number, ComparacaoHistorico> {
  const grupos = gruposDaNota(ATUAL);
  return compararNota(ATUAL, indexarCompras(NOTAS, grupos), grupos);
}

function item(extra: Partial<ItemNota>): ItemNota {
  return {
    n: 1,
    descricao: 'ARROZ TIO JOAO 5KG',
    codigo: '1',
    ean: null,
    qtd: 1,
    unidade: 'UN',
    vlUnit: 10,
    vlTotal: 10,
    produtoId: 'loc:1:1',
    precoPorUnidadeBase: null,
    ...extra,
  };
}

function compra(extra: Partial<CompraPessoal>): CompraPessoal {
  return {
    chave: 'anterior',
    n: 1,
    cnpj: '1',
    mercado: 'Mercado X',
    emissao: '2026-08-01T00:00:00.000Z',
    produtoId: 'loc:1:1',
    descricao: 'ARROZ TIO JOAO 5KG',
    qtd: 1,
    unidade: 'UN',
    vlUnit: 10,
    porUnidade: null,
    ...extra,
  };
}

const NOTA = { chave: 'atual', emissao: '2026-09-01T00:00:00.000Z' };

describe('consolidarItens', () => {
  const det = (n: number, extra: Partial<ItemNota> = {}) =>
    item({
      n,
      produtoId: 'loc:1:9',
      descricao: 'Det Ype 500ml Coco',
      vlUnit: 2.49,
      vlTotal: 2.49,
      ...extra,
    });

  it('junta lançamentos do mesmo produto e preço, somando qtd e total, com o n do primeiro', () => {
    const r = consolidarItens([det(3), item({ n: 4 }), det(7), det(9, { unidade: 'un' })]);
    expect(r.map((i) => i.n)).toEqual([3, 4]);
    expect(r[0]).toMatchObject({ qtd: 3, vlTotal: 7.47 });
  });

  it('preço ou unidade diferente continua em linha separada', () => {
    const r = consolidarItens([
      det(1),
      det(2, { vlUnit: 1.99, vlTotal: 1.99 }),
      det(3, { unidade: 'CX' }),
    ]);
    expect(r.map((i) => i.n)).toEqual([1, 2, 3]);
  });

  it('comparação e histórico usam a nota consolidada', () => {
    const anterior = {
      ...N1,
      chave: 'ant',
      emissao: '2026-09-01T00:00:00.000Z',
      itens: [det(1, { vlUnit: 2.79 }), det(2, { vlUnit: 2.79 })],
    };
    const atual = { ...ATUAL, chave: 'atu', itens: [det(1), det(2), det(3)] };
    const grupos = new Map<string, string>();
    const indice = indexarCompras([anterior, atual], grupos);
    expect(indice.get('loc:1:9')!.map((c) => c.chave)).toEqual(['atu', 'ant']);
    const r = compararNota(atual, indice, grupos);
    expect([...r.keys()]).toEqual([1]);
    expect(r.get(1)).toMatchObject({ tipo: 'melhor', novoMelhor: true, impacto: 0, vezes: 1 });
    expect(comValores(r.get(1))!.ultima).toMatchObject({ tendencia: 'baixou', diferenca: -0.3 });
  });
});

describe('montarGrupos e indexarCompras', () => {
  it('mesmo produtoId em duas notas cai na mesma lista, da mais recente para a mais antiga', () => {
    const indice = indexarCompras(NOTAS, gruposDaNota(ATUAL));
    const cafe = indice.get(`loc:${A}:101`)!;
    expect(cafe.map((c) => c.chave)).toEqual([POSTERIOR.chave, ATUAL.chave, N1.chave]);
  });

  it('loc: de outro mercado vinculado ao mesmo canônico cai na lista do canônico', () => {
    const indice = indexarCompras(NOTAS, gruposDaNota(ATUAL));
    const leite = indice.get('ean:7896000000017')!;
    expect(leite.map((c) => c.produtoId).sort()).toEqual([`loc:${A}:103`, `loc:${B}:201`]);
  });

  it('sem vínculo fica separado (o café do Mercado B não entra no do Mercado A)', () => {
    const indice = indexarCompras(NOTAS, gruposDaNota(ATUAL));
    expect(indice.get(`loc:${B}:204`)!.map((c) => c.chave)).toEqual([N2.chave]);
    expect(indice.get(`loc:${A}:101`)!.some((c) => c.cnpj === B)).toBe(false);
  });

  it('desempata por chave e n na mesma data', () => {
    const indice = indexarCompras(
      [
        { ...N1, chave: 'b', itens: [N1.itens[0]] },
        {
          ...N1,
          chave: 'a',
          itens: [
            N1.itens[0],
            { ...N1.itens[0], n: 9, vlUnit: 17 },
            { ...N1.itens[0], n: 2, vlUnit: 16 },
          ],
        },
      ],
      new Map(),
    );
    expect(indice.get(N1.itens[0].produtoId)!.map((c) => `${c.chave}${c.n}`)).toEqual([
      'a1',
      'a2',
      'a9',
      'b1',
    ]);
  });
});

describe('compararItem', () => {
  it('acima do melhor: diferença por unidade, % e impacto × quantidade', () => {
    const r = compararItem(item({ qtd: 3, vlUnit: 5.99 }), NOTA, [compra({ vlUnit: 5.49 })]);
    expect(r).toMatchObject({
      tipo: 'acima',
      base: 'unidade',
      melhor: 5.49,
      diferenca: 0.5,
      percentual: 9.1,
      impacto: 1.5,
      novoMelhor: false,
      vezes: 1,
    });
  });

  it('Box 10,00 → Merkagel 11,00 → Merkagel 11,00: as duas acima do Box', () => {
    const coca = { descricao: 'REFR COCA COLA ZERO 2L' };
    const box = compra({
      ...coca,
      chave: 'box',
      mercado: 'Box',
      emissao: '2026-09-20T12:00:00.000Z',
      vlUnit: 10,
    });
    const merk1 = compra({
      ...coca,
      chave: 'merk1',
      mercado: 'Merkagel',
      emissao: '2026-09-25T12:00:00.000Z',
      vlUnit: 11,
    });
    const atual = item({ ...coca, qtd: 2, vlUnit: 11 });

    const primeira = comValores(
      compararItem(atual, { chave: 'merk1', emissao: merk1.emissao }, [box]),
    )!;
    expect(primeira).toMatchObject({ tipo: 'acima', melhor: 10, diferenca: 1, impacto: 2 });
    expect(primeira.referencia.mercado).toBe('Box');

    const segunda = comValores(
      compararItem(atual, { chave: 'merk2', emissao: '2026-09-29T12:00:00.000Z' }, [merk1, box]),
    )!;
    expect(segunda).toMatchObject({ tipo: 'acima', melhor: 10, diferenca: 1, impacto: 2 });
    expect(segunda.referencia.chave).toBe('box');
    expect(segunda.ultima).toMatchObject({ tendencia: 'igual', diferenca: 0, valor: 11 });
    expect(segunda.ultima!.compra.chave).toBe('merk1');
  });

  it('janela de 60 dias: compra mais barata de 61 dias atrás não conta, de 59 conta', () => {
    const r = (dias: number) =>
      comValores(
        compararItem(item({ vlUnit: 10 }), NOTA, [
          compra({ chave: 'recente', emissao: '2026-08-25T00:00:00.000Z', vlUnit: 10 }),
          compra({
            chave: 'antiga',
            emissao: new Date(Date.parse(NOTA.emissao) - dias * 86_400_000).toISOString(),
            vlUnit: 8,
          }),
        ]),
      )!;
    expect(r(61)).toMatchObject({ tipo: 'melhor', melhor: 10, menor: 8 });
    expect(r(59)).toMatchObject({ tipo: 'acima', melhor: 8, impacto: 2 });
    expect(r(60).referencia.chave).toBe('antiga');
  });

  it('abaixo do melhor → novo melhor preço, sem impacto, tendência baixou', () => {
    const r = compararItem(item({ qtd: 2, vlUnit: 9 }), NOTA, [compra({ vlUnit: 10 })]);
    expect(r).toMatchObject({
      tipo: 'melhor',
      novoMelhor: true,
      diferenca: 0,
      impacto: 0,
      economia: 2,
    });
    expect(comValores(r)!.ultima).toMatchObject({ tendencia: 'baixou', diferenca: -1 });
  });

  it('igual ao melhor dentro de meio centavo → melhor, sem novo melhor', () => {
    const r = compararItem(item({ vlUnit: 10.004 }), NOTA, [compra({ vlUnit: 10 })]);
    expect(r).toMatchObject({ tipo: 'melhor', novoMelhor: false, diferenca: 0, impacto: 0 });
  });

  it('empate no melhor preço → referência é a mais recente', () => {
    const r = comValores(
      compararItem(item({ vlUnit: 12 }), NOTA, [
        compra({ chave: 'nova', emissao: '2026-08-20T00:00:00.000Z', vlUnit: 10 }),
        compra({ chave: 'velha', emissao: '2026-08-10T00:00:00.000Z', vlUnit: 10 }),
      ]),
    )!;
    expect(r.referencia.chave).toBe('nova');
  });

  it('melhor de qualquer mercado; a última compra, mais cara, fica só como tendência', () => {
    const r = comValores(
      compararItem(item({ vlUnit: 11 }), NOTA, [
        compra({ chave: 'b', mercado: 'B', emissao: '2026-08-20T00:00:00.000Z', vlUnit: 12 }),
        compra({ chave: 'a', mercado: 'A', emissao: '2026-08-10T00:00:00.000Z', vlUnit: 9.5 }),
      ]),
    )!;
    expect(r).toMatchObject({ tipo: 'acima', melhor: 9.5, diferenca: 1.5 });
    expect(r.referencia.mercado).toBe('A');
    expect(r.ultima).toMatchObject({ tendencia: 'baixou', diferenca: -1 });
  });

  it('só compras com mais de 60 dias → sem-recente com a última', () => {
    const r = compararItem(item({}), NOTA, [
      compra({ chave: 'c2', emissao: '2026-06-20T00:00:00.000Z' }),
      compra({ chave: 'c1', emissao: '2026-05-20T00:00:00.000Z' }),
    ]);
    expect(r.tipo).toBe('sem-recente');
    expect(r.tipo === 'sem-recente' && r.ultima.chave).toBe('c2');
    expect(r.tipo === 'sem-recente' && r.compras).toHaveLength(2);
  });

  it('sem compra anterior → primeira compra', () => {
    expect(compararItem(item({}), NOTA, [])).toEqual({ tipo: 'primeira-compra' });
  });

  it('só compra posterior → primeira compra', () => {
    const r = compararItem(item({}), NOTA, [compra({ emissao: '2026-09-10T00:00:00.000Z' })]);
    expect(r).toEqual({ tipo: 'primeira-compra' });
  });

  it('item repetido na mesma nota não se compara consigo', () => {
    const r = compararItem(item({}), NOTA, [
      compra({ chave: 'atual', n: 2, emissao: NOTA.emissao }),
      compra({ chave: 'atual', n: 1, emissao: NOTA.emissao }),
    ]);
    expect(r).toEqual({ tipo: 'primeira-compra' });
  });

  it('menor, média e vezes olham os 12 meses; compra posterior não conta', () => {
    const compras = [
      compra({ chave: 'depois', emissao: '2026-09-20T00:00:00.000Z', vlUnit: 1 }),
      compra({ chave: 'c3', emissao: '2026-08-20T00:00:00.000Z', vlUnit: 12 }),
      compra({ chave: 'c2', emissao: '2026-07-20T00:00:00.000Z', vlUnit: 9 }),
      compra({ chave: 'c1', emissao: '2026-06-20T00:00:00.000Z', vlUnit: 11 }),
    ];
    const r = comValores(compararItem(item({ vlUnit: 10 }), NOTA, compras))!;
    expect(r.referencia.chave).toBe('c2');
    expect(r).toMatchObject({ tipo: 'acima', melhor: 9, menor: 9, media: 10.67, vezes: 3 });
    expect(r.ultima).toMatchObject({ tendencia: 'baixou', diferenca: -2 });
    const minimo = comValores(compararItem(item({ vlUnit: 8 }), NOTA, compras))!;
    expect(minimo).toMatchObject({ tipo: 'melhor', novoMelhor: true, menor: 8 });
    expect(r.compras.map((c) => c.chave)).toEqual(['c3', 'c2', 'c1']);
  });

  it('KG × KG compara o preço do quilo e multiplica pelos quilos', () => {
    const r = compararItem(
      item({ descricao: 'TOMATE KG', unidade: 'KG', qtd: 1.245, vlUnit: 7.99 }),
      NOTA,
      [compra({ descricao: 'TOMATE KG', unidade: 'kg', vlUnit: 5.99 })],
    );
    expect(r).toMatchObject({ tipo: 'acima', base: 'unidade', diferenca: 2, impacto: 2.49 });
  });

  it('2L × 3L do mesmo grupo compara por R$/L', () => {
    const r = compararItem(
      item({
        descricao: 'Refr Coca Cola 2l Ze',
        qtd: 2,
        vlUnit: 9.98,
        precoPorUnidadeBase: { valor: 4.99, unidade: 'L' },
      }),
      NOTA,
      [
        compra({
          descricao: 'REFR COCA COLA 3L',
          vlUnit: 13.5,
          porUnidade: { valor: 4.5, unidade: 'L' },
        }),
      ],
    );
    expect(r).toMatchObject({ tipo: 'acima', base: 'L', diferenca: 0.49, impacto: 1.96 });
  });

  it('a base que aceita mais compras da janela vence', () => {
    const r = comValores(
      compararItem(
        item({
          descricao: 'REFR COCA COLA 2L',
          vlUnit: 10,
          precoPorUnidadeBase: { valor: 5, unidade: 'L' },
        }),
        NOTA,
        [
          compra({
            chave: 'c3',
            descricao: 'REFR COCA COLA 3L',
            vlUnit: 13.5,
            porUnidade: { valor: 4.5, unidade: 'L' },
          }),
          compra({
            chave: 'c2',
            emissao: '2026-07-25T00:00:00.000Z',
            descricao: 'REFR COCA COLA 1L',
            vlUnit: 4,
            porUnidade: { valor: 4, unidade: 'L' },
          }),
          compra({
            chave: 'c1',
            emissao: '2026-07-20T00:00:00.000Z',
            descricao: 'REFR COCA COLA 2L',
            vlUnit: 9,
            porUnidade: { valor: 4.5, unidade: 'L' },
          }),
        ],
      ),
    )!;
    expect(r).toMatchObject({ base: 'L', melhor: 4, diferenca: 1, impacto: 2 });
    expect(r.referencia.chave).toBe('c2');
  });

  it('UN × KG sem conteúdo → sem comparação, com as compras para a expansão', () => {
    const r = compararItem(item({ descricao: 'REPOLHO VERDE UN', vlUnit: 4.5 }), NOTA, [
      compra({ descricao: 'REPOLHO', unidade: 'KG', porUnidade: { valor: 3.99, unidade: 'kg' } }),
    ]);
    expect(r.tipo).toBe('sem-comparacao');
    expect(r.tipo === 'sem-comparacao' && r.compras).toHaveLength(1);
  });

  it('mesma unidade base mas sem conteúdo para a quantidade → sem comparação', () => {
    const r = compararItem(
      item({
        descricao: 'COCA COLA ZERO',
        unidade: 'CX',
        precoPorUnidadeBase: { valor: 4.99, unidade: 'L' },
      }),
      NOTA,
      [compra({ porUnidade: { valor: 4.5, unidade: 'L' } })],
    );
    expect(r.tipo).toBe('sem-comparacao');
  });

  it('última compra em outra unidade não vira tendência', () => {
    const r = comValores(
      compararItem(item({ descricao: 'MAMAO', vlUnit: 7 }), NOTA, [
        compra({
          chave: 'kg',
          emissao: '2026-08-20T00:00:00.000Z',
          descricao: 'MAMAO',
          unidade: 'KG',
          vlUnit: 5,
          porUnidade: { valor: 5, unidade: 'kg' },
        }),
        compra({ chave: 'un', descricao: 'MAMAO', vlUnit: 6 }),
      ]),
    )!;
    expect(r).toMatchObject({ tipo: 'acima', melhor: 6, ultima: null });
  });

  it('expansão guarda no máximo 5 compras', () => {
    const compras = Array.from({ length: 8 }, (_, i) =>
      compra({ chave: `c${i}`, emissao: `2026-08-0${i + 1}T00:00:00.000Z` }),
    ).reverse();
    const r = comValores(compararItem(item({}), NOTA, compras))!;
    expect(r.compras).toHaveLength(5);
    expect(r.vezes).toBe(8);
  });
});

describe('baseComum', () => {
  const d = (dia: number) => `2026-08-${String(dia).padStart(2, '0')}T12:00:00.000Z`;
  const aceitas = (compras: CompraPessoal[]) => {
    const b = baseComum(compras)!;
    return { base: b.base, aceitas: compras.filter(b.aceita).map((c) => b.valor(c)) };
  };

  it('sem compras não há base', () => {
    expect(baseComum([])).toBeNull();
  });

  it('mesma unidade e conteúdo: vlUnit', () => {
    const compras = [compra({ emissao: d(1), vlUnit: 10 }), compra({ emissao: d(9), vlUnit: 12 })];
    expect(aceitas(compras)).toEqual({ base: 'unidade', aceitas: [10, 12] });
  });

  it('granel em kg: vlUnit, que já é R$/kg', () => {
    const kg = { unidade: 'KG', descricao: 'BANANA PRATA KG' };
    const compras = [
      compra({ ...kg, emissao: d(2), vlUnit: 5.49, porUnidade: { valor: 5.49, unidade: 'kg' } }),
      compra({ ...kg, emissao: d(1), vlUnit: 4.99, porUnidade: { valor: 4.99, unidade: 'kg' } }),
    ];
    expect(aceitas(compras)).toEqual({ base: 'unidade', aceitas: [5.49, 4.99] });
  });

  it('embalagens diferentes: R$ por unidade base aceita as duas', () => {
    const compras = [
      compra({
        emissao: d(9),
        descricao: 'DETERGENTE 1L',
        vlUnit: 6,
        porUnidade: { valor: 6, unidade: 'L' },
      }),
      compra({
        emissao: d(1),
        descricao: 'DETERGENTE 500ML',
        vlUnit: 2.5,
        porUnidade: { valor: 5, unidade: 'L' },
      }),
    ];
    expect(aceitas(compras)).toEqual({ base: 'L', aceitas: [6, 5] });
  });

  it('UN × KG sem unidade base: a incompatível fica fora', () => {
    const compras = [
      compra({ emissao: d(9), descricao: 'MAMAO', vlUnit: 7 }),
      compra({
        emissao: d(1),
        descricao: 'MAMAO',
        unidade: 'KG',
        vlUnit: 5,
        porUnidade: { valor: 5, unidade: 'kg' },
      }),
    ];
    expect(aceitas(compras)).toEqual({ base: 'unidade', aceitas: [7] });
    expect(unidadeNormalizada(' kg ')).toBe('KG');
  });
});

describe('fixture notas-historico: nota de 20/09 no Mercado A', () => {
  it('cada item cai no ramo esperado (a nota de 10/06 fica fora dos 60 dias)', () => {
    const r = compararAtual();
    expect([...r.values()].map((c) => c.tipo)).toEqual([
      'sem-recente',
      'sem-recente',
      'acima',
      'sem-recente',
      'acima',
      'sem-comparacao',
      'primeira-compra',
      'sem-recente',
    ]);
    expect(comValores(r.get(3))!.referencia.mercado).toBe('Mercado B');
    expect(comValores(r.get(5))!.base).toBe('L');
    const cafe = r.get(1)!;
    expect(cafe.tipo === 'sem-recente' && cafe.ultima.chave).toBe(N1.chave);
  });

  it('resumo: a mais dos itens acima do melhor, sem novos melhores', () => {
    // Leite (4,99 − 4,59) × 3 = 1,20 · Coca (4,99 − 4,50)/L × 4 L = 1,96
    expect(resumirHistorico(ATUAL.itens, compararAtual())).toEqual({
      aMais: 3.16,
      itensAcima: 2,
      economia: 0,
      saldo: 3.16,
      itensNoMelhor: 0,
      itensNovoMelhor: 0,
      comparados: 2,
      total: 8,
    });
  });

  it('nota de 27/09: novos melhores somam economia e o saldo fica negativo', () => {
    const grupos = gruposDaNota(POSTERIOR);
    const r = compararNota(POSTERIOR, indexarCompras(NOTAS, grupos), grupos);
    expect(r.get(1)).toMatchObject({ tipo: 'melhor', novoMelhor: true, melhor: 18.9 });
    expect(r.get(2)).toMatchObject({ tipo: 'melhor', novoMelhor: true, melhor: 21.4 });
    // Ovos (18,90 − 17,90) × 1 + Café (21,40 − 19,00) × 1 = 3,40
    expect(resumirHistorico(POSTERIOR.itens, r)).toEqual({
      aMais: 0,
      itensAcima: 0,
      economia: 3.4,
      saldo: -3.4,
      itensNoMelhor: 2,
      itensNovoMelhor: 2,
      comparados: 2,
      total: 2,
    });
  });

  it('a mais e economia aparecem separados e o saldo compensa um com o outro', () => {
    const acima = compararItem(item({ n: 1, qtd: 2, vlUnit: 11 }), NOTA, [compra({ vlUnit: 10 })]);
    const abaixo = compararItem(item({ n: 2, qtd: 3, vlUnit: 4 }), NOTA, [compra({ vlUnit: 5 })]);
    const r = new Map([
      [1, acima],
      [2, abaixo],
    ]);
    expect(resumirHistorico([item({ n: 1 }), item({ n: 2 })], r)).toMatchObject({
      aMais: 2,
      economia: 3,
      saldo: -1,
      itensAcima: 1,
      itensNovoMelhor: 1,
    });
  });

  it('destaques: acima por impacto, novos melhores por economia', () => {
    expect(destaques(compararAtual())).toEqual({ altas: [5, 3], quedas: [] });
    const grupos = gruposDaNota(POSTERIOR);
    const r = compararNota(POSTERIOR, indexarCompras(NOTAS, grupos), grupos);
    // Café 2,40 de economia, ovos 1,00
    expect(destaques(r)).toEqual({ altas: [], quedas: [2, 1] });
  });

  it('filtros', () => {
    const r = compararAtual();
    expect(filtrarItens(ATUAL.itens, r, 'acima').map((i) => i.n)).toEqual([3, 5]);
    expect(filtrarItens(ATUAL.itens, r, 'melhor')).toEqual([]);
    expect(filtrarItens(ATUAL.itens, r, 'primeira').map((i) => i.n)).toEqual([7]);
    expect(filtrarItens(ATUAL.itens, r, 'todos')).toHaveLength(8);
    expect(contarPorFiltro(ATUAL.itens, r)).toEqual({
      todos: 8,
      acima: 2,
      melhor: 0,
      primeira: 1,
    });
  });

  it('item sem comparação no mapa não conta como comparado', () => {
    expect(resumirHistorico(ATUAL.itens, new Map()).comparados).toBe(0);
  });
});
