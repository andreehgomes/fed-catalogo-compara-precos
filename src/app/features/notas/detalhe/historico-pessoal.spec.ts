import type { ItemNota, Nota, Produto } from '@shared/model';
import notasJson from '../../../../testing/fixtures/notas-historico/notas.json';
import produtosJson from '../../../../testing/fixtures/notas-historico/produtos.json';
import {
  CompraPessoal,
  ComparacaoHistorico,
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
      itens: [det(1, { vlUnit: 2.79 }), det(2, { vlUnit: 2.79 })],
    };
    const atual = { ...ATUAL, chave: 'atu', itens: [det(1), det(2), det(3)] };
    const grupos = new Map<string, string>();
    const indice = indexarCompras([anterior, atual], grupos);
    expect(indice.get('loc:1:9')!.map((c) => c.chave)).toEqual(['atu', 'ant']);
    const r = compararNota(atual, indice, grupos);
    expect([...r.keys()]).toEqual([1]);
    // (2,49 − 2,79) × 3 un
    expect(r.get(1)).toMatchObject({ tipo: 'mais-barato', impacto: -0.9, vezes: 1 });
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
  it('subiu: diferença por unidade, % e impacto × quantidade', () => {
    const r = compararItem(item({ qtd: 3, vlUnit: 5.99 }), NOTA, [compra({ vlUnit: 5.49 })]);
    expect(r).toMatchObject({
      tipo: 'mais-caro',
      base: 'unidade',
      valorAnterior: 5.49,
      diferenca: 0.5,
      percentual: 9.1,
      impacto: 1.5,
      vezes: 1,
    });
  });

  it('baixou: impacto negativo', () => {
    const r = compararItem(item({ qtd: 2, vlUnit: 9 }), NOTA, [compra({ vlUnit: 10 })]);
    expect(r).toMatchObject({ tipo: 'mais-barato', diferenca: -1, impacto: -2, percentual: -10 });
  });

  it('mesmo preço dentro de meio centavo → igual, impacto 0', () => {
    const r = compararItem(item({ vlUnit: 10.004 }), NOTA, [compra({ vlUnit: 10 })]);
    expect(r).toMatchObject({ tipo: 'igual', diferenca: 0, percentual: 0, impacto: 0 });
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

  it('referência é a última anterior; menor, média e vezes sobre as anteriores', () => {
    const compras = [
      compra({ chave: 'depois', emissao: '2026-09-20T00:00:00.000Z', vlUnit: 1 }),
      compra({ chave: 'c3', emissao: '2026-08-20T00:00:00.000Z', vlUnit: 12 }),
      compra({ chave: 'c2', emissao: '2026-07-20T00:00:00.000Z', vlUnit: 9 }),
      compra({ chave: 'c1', emissao: '2026-06-20T00:00:00.000Z', vlUnit: 11 }),
    ];
    const r = comValores(compararItem(item({ vlUnit: 10 }), NOTA, compras))!;
    expect(r.referencia.chave).toBe('c3');
    expect(r.tipo).toBe('mais-barato');
    expect(r).toMatchObject({ menor: 9, media: 10.67, vezes: 3 });
    expect(r.compras.map((c) => c.chave)).toEqual(['c3', 'c2', 'c1']);
  });

  it('KG × KG compara o preço do quilo e multiplica pelos quilos', () => {
    const r = compararItem(
      item({ descricao: 'TOMATE KG', unidade: 'KG', qtd: 1.245, vlUnit: 7.99 }),
      NOTA,
      [compra({ descricao: 'TOMATE KG', unidade: 'kg', vlUnit: 5.99 })],
    );
    expect(r).toMatchObject({ tipo: 'mais-caro', base: 'unidade', diferenca: 2, impacto: 2.49 });
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
    expect(r).toMatchObject({ tipo: 'mais-caro', base: 'L', diferenca: 0.49, impacto: 1.96 });
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

  it('expansão guarda no máximo 5 compras', () => {
    const compras = Array.from({ length: 8 }, (_, i) =>
      compra({ chave: `c${i}`, emissao: `2026-08-0${i + 1}T00:00:00.000Z` }),
    ).reverse();
    const r = comValores(compararItem(item({}), NOTA, compras))!;
    expect(r.compras).toHaveLength(5);
    expect(r.vezes).toBe(8);
  });
});

describe('fixture notas-historico: nota de 20/09 no Mercado A', () => {
  it('cada item cai no ramo esperado', () => {
    const r = compararAtual();
    expect([...r.values()].map((c) => c.tipo)).toEqual([
      'mais-caro',
      'mais-barato',
      'mais-caro',
      'mais-barato',
      'mais-caro',
      'sem-comparacao',
      'primeira-compra',
      'igual',
    ]);
    expect(comValores(r.get(1))!.referencia.chave).toBe(N1.chave);
    expect(comValores(r.get(3))!.referencia.mercado).toBe('Mercado B');
    expect(comValores(r.get(5))!.base).toBe('L');
  });

  it('resumo bate com a soma manual', () => {
    // Café (21,40 − 18,90) × 2 = 5,00 · Leite (4,99 − 4,59) × 3 = 1,20 · Coca (4,99 − 4,50)/L × 4 L = 1,96
    const aMais = 5 + 1.2 + 1.96;
    // Detergente (2,79 − 2,49) × 10 = 3,00 · Tomate (8,99 − 7,99)/kg × 1,25 kg = 1,25
    const aMenos = 3 + 1.25;
    const resumo = resumirHistorico(ATUAL.itens, compararAtual());
    expect(resumo).toEqual({
      aMais: Math.round(aMais * 100) / 100,
      itensAMais: 3,
      aMenos: Math.round(aMenos * 100) / 100,
      itensAMenos: 2,
      saldo: Math.round((aMais - aMenos) * 100) / 100,
      comparados: 6,
      total: 8,
    });
    expect(resumo.saldo).toBe(3.91);
  });

  it('destaques por |impacto| e filtro', () => {
    const r = compararAtual();
    expect(destaques(r)).toEqual({ altas: [1, 5, 3], quedas: [2, 4] });
    expect(destaques(r, 1)).toEqual({ altas: [1], quedas: [2] });
    expect(filtrarItens(ATUAL.itens, r, 'subiram').map((i) => i.n)).toEqual([1, 3, 5]);
    expect(filtrarItens(ATUAL.itens, r, 'baixaram').map((i) => i.n)).toEqual([2, 4]);
    expect(filtrarItens(ATUAL.itens, r, 'primeira').map((i) => i.n)).toEqual([7]);
    expect(filtrarItens(ATUAL.itens, r, 'todos')).toHaveLength(8);
    expect(contarPorFiltro(ATUAL.itens, r)).toEqual({
      todos: 8,
      subiram: 3,
      baixaram: 2,
      primeira: 1,
    });
  });

  it('item sem comparação no mapa não conta como comparado', () => {
    expect(resumirHistorico(ATUAL.itens, new Map()).comparados).toBe(0);
  });
});
