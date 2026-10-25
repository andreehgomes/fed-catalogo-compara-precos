import { describe, expect, it } from 'vitest';
import { etiquetar } from '@shared/etiquetas';
import type { Produto } from '@shared/model';
import type { NomeIa } from '@shared/nome-produto';
import type { ItemNome } from '../src/nome/ia-nome';
import { normalizarDescricao, tokens } from '@shared/normalizar';
import type { ItemIa } from '../src/vinculo/ia';
import { reprocessarVinculos } from '../src/vinculo/reprocessar-vinculos';
import { caminhoGastoIa } from '../src/vinculo/vincular-nota';
import { criarContexto } from './apoio';

const LOJA_A = '03644587000836';
const LOJA_B = '11111111000111';
const GASTO = caminhoGastoIa(new Date('2026-09-27T15:00:00.000Z'));

function produto(
  loja: string,
  codigo: string,
  descricao: string,
  extra: Partial<Produto> = {},
): Produto {
  const etiquetas = etiquetar(descricao);
  return {
    id: `loc:${loja}:${codigo}`,
    ean: null,
    descricao,
    descricaoNorm: normalizarDescricao(descricao),
    tokens: tokens(descricao),
    conteudo: null,
    vinculadoA: null,
    menorPreco: null,
    ultimaObservacao: null,
    cnpjs: [loja],
    etiquetas,
    bloco: etiquetas.bloco,
    ...extra,
  };
}

/** Como estavam os produtos gravados antes das etiquetas. */
function antigo(p: Produto): Produto {
  const { etiquetas: _e, bloco: _b, ...resto } = p;
  return resto as Produto;
}

async function preparar(produtos: Produto[]) {
  const ctx = criarContexto();
  for (const p of produtos) await ctx.repo.gravar(`produtos/${p.id}`, { ...p });
  return ctx;
}

describe('reprocessarVinculos', () => {
  it('produto antigo ganha etiquetas e bloco e liga pela regra a outra loja; o par não se repete', async () => {
    const a = antigo(produto(LOJA_A, 'D1', 'DET YPE COCO 500ML'));
    const b = antigo(produto(LOJA_B, 'D9', 'Det Ype 500ml Coco'));
    const ctx = await preparar([a, b]);

    const r = await reprocessarVinculos(ctx, [a, b]);

    expect(r).toMatchObject({
      etiquetasPreenchidas: 2,
      semVinculo: 2,
      lojas: 2,
      etiquetas: 1,
      ia: 0,
    });
    expect(await ctx.repo.obter(`produtos/${a.id}`)).toMatchObject({
      bloco: 'YPE|0.5L',
      etiquetas: { variantes: ['COCO'] },
      vinculadoA: b.id,
      vinculoMotivo: 'etiquetas',
    });
    expect(await ctx.repo.obter(`produtos/${b.id}`)).toMatchObject({ vinculadoA: null });
    expect(ctx.classificarVinculos).not.toHaveBeenCalled();
  });

  it('dúvidas vão para a IA por loja; vinculado, bloqueado, ean: e sem bloco ficam de fora', async () => {
    const coca = produto(LOJA_B, 'C1', 'REFR COCA COLA 2L');
    const novo = produto(LOJA_A, 'C2', 'REFR COCA COLA 2L');
    const fora = [
      produto(LOJA_A, 'X1', 'REFR COCA COLA 600ML', { vinculadoA: coca.id }),
      produto(LOJA_A, 'X2', 'REFR COCA COLA 600ML', { vinculoBloqueado: true }),
      produto(LOJA_A, 'X3', 'DETERGENTE YPE COCO'),
      { ...produto(LOJA_A, 'X4', 'REFR COCA COLA 600ML'), id: 'ean:7894900011517' as const },
    ];
    const ctx = await preparar([coca, novo, ...fora]);
    ctx.classificarVinculos.mockImplementation(async (itens: ItemIa[]) => ({
      decisoes: itens.map((it) => ({ i: it.i, r: it.c[0].id })),
      custoUsd: 0.01,
    }));

    const r = await reprocessarVinculos(ctx, [coca, novo, ...fora]);

    expect(r).toMatchObject({
      semVinculo: 2,
      lojas: 2,
      duvidas: 1,
      ia: 1,
      chamadasIa: 1,
      custoUsd: 0.01,
    });
    expect(ctx.classificarVinculos.mock.calls.flatMap((c) => c[0].map((it) => it.d))).toEqual([
      'REFR COCA COLA 2L',
    ]);
    expect(await ctx.repo.obter(`produtos/${novo.id}`)).toMatchObject({ vinculoMotivo: 'ia' });
    expect(await ctx.repo.obter(GASTO)).toMatchObject({ custoUsd: 0.01, chamadas: 1 });
  });

  it('loja com mais de 80 produtos vai em rodadas de até 80', async () => {
    const tamanhos = Array.from({ length: 90 }, (_, k) => 201 + k);
    const base = tamanhos.map((ml) => produto(LOJA_B, `B${ml}`, `REFR COCA COLA ${ml}ML`));
    const novos = tamanhos.map((ml) => produto(LOJA_A, `A${ml}`, `REFR COCA COLA ${ml}ML`));
    const ctx = await preparar([...base, ...novos]);

    const r = await reprocessarVinculos(ctx, novos);

    expect(ctx.classificarVinculos.mock.calls.map((c) => c[0].length)).toEqual([40, 40, 10]);
    expect(r).toMatchObject({ duvidas: 90, chamadasIa: 3 });
  });

  it('produto sem nome ganha nome e etiquetas da IA antes do vínculo; a granel liga pela regra', async () => {
    const cebola: NomeIa = {
      nome: 'Cebola',
      tipo: 'cebola',
      marca: null,
      variantes: [],
      tamanho: null,
      granel: true,
    };
    const a = produto(LOJA_A, 'C1', 'Cebola Kg');
    const b = produto(LOJA_B, 'C2', 'FEIRA CEBOLA KG');
    const manual = produto(LOJA_A, 'M1', 'Det Ype 500ml Coco', {
      nome: 'Meu detergente',
      nomeOrigem: 'manual',
    });
    const ctx = await preparar([a, b, manual]);
    ctx.normalizarNomes.mockImplementation(async (itens: ItemNome[]) => ({
      nomes: new Map(itens.map((it) => [it.i, cebola])),
      custoUsd: 0.02,
      chamadas: 1,
    }));

    const r = await reprocessarVinculos(ctx, [a, b, manual]);

    expect(ctx.normalizarNomes.mock.calls[0][0]).toEqual([
      { i: 1, d: 'Cebola Kg' },
      { i: 2, d: 'FEIRA CEBOLA KG' },
    ]);
    expect(r).toMatchObject({ semNome: 2, nomeados: 2, chamadasNome: 1, custoNomeUsd: 0.02 });
    expect(r.erroNome).toBeUndefined();
    expect(await ctx.repo.obter(`produtos/${b.id}`)).toMatchObject({
      nome: 'Cebola',
      nomeOrigem: 'ia',
      bloco: 'GRANEL|CEBOLA',
      etiquetas: { origem: 'ia' },
    });
    expect(await ctx.repo.obter(`produtos/${a.id}`)).toMatchObject({
      vinculadoA: b.id,
      vinculoMotivo: 'etiquetas',
    });
    expect(await ctx.repo.obter(`produtos/${manual.id}`)).toMatchObject({ nome: 'Meu detergente' });
    expect(await ctx.repo.obter(GASTO)).toMatchObject({ porEtapa: { nome: { chamadas: 1 } } });
  });

  it('IA de nome fora: segue só com a regra e registra o motivo', async () => {
    const a = antigo(produto(LOJA_A, 'D1', 'DET YPE COCO 500ML'));
    const b = antigo(produto(LOJA_B, 'D9', 'Det Ype 500ml Coco'));
    const ctx = await preparar([a, b]);
    ctx.normalizarNomes.mockRejectedValue(new Error('rede'));

    const r = await reprocessarVinculos(ctx, [a, b]);

    expect(r).toMatchObject({ semNome: 2, nomeados: 0, erroNome: 'ia-erro', etiquetas: 1 });
    expect((await ctx.repo.obter<Produto>(`produtos/${a.id}`))?.nome).toBeUndefined();
  });

  it('resposta parcial grava o que veio e guarda o motivo da parte que falhou', async () => {
    const a = produto(LOJA_A, 'X1', 'Req Batavo 200g Ligh');
    const ctx = await preparar([a]);
    ctx.normalizarNomes.mockResolvedValue({
      nomes: new Map(),
      custoUsd: 0,
      chamadas: 1,
      erro: new Error('timeout'),
    });
    const r = await reprocessarVinculos(ctx, [a]);
    expect(r).toMatchObject({ semNome: 1, nomeados: 0, erroNome: 'ia-erro' });
  });
});
