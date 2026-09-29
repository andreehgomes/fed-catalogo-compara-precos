import { describe, expect, it } from 'vitest';
import { etiquetar } from '@shared/etiquetas';
import type { NfceParsed, Nota, Produto, ProdutoId } from '@shared/model';
import { normalizarDescricao, tokens } from '@shared/normalizar';
import { gravarNota } from '../src/importar/gravar-nota';
import { IA_TETO_MENSAL_USD } from '../src/vinculo/config-ia';
import type { ItemIa } from '../src/vinculo/ia';
import { caminhoGastoIa, vincularNota } from '../src/vinculo/vincular-nota';
import { CHAVE, criarContexto, notaExemplo } from './apoio';

const OUTRA_LOJA = '11111111000111';
const LOJA = '03644587000836';
const GASTO = caminhoGastoIa(new Date('2026-09-27T15:00:00.000Z'));

function produtoBase(codigo: string, descricao: string, cnpjs = [OUTRA_LOJA]): Produto {
  const etiquetas = etiquetar(descricao);
  return {
    id: `loc:${cnpjs[0]}:${codigo}`,
    ean: null,
    descricao,
    descricaoNorm: normalizarDescricao(descricao),
    tokens: tokens(descricao),
    conteudo: null,
    vinculadoA: null,
    menorPreco: null,
    ultimaObservacao: null,
    cnpjs,
    etiquetas,
    bloco: etiquetas.bloco,
  };
}

function nota(descricoes: string[]): NfceParsed {
  const base = notaExemplo();
  return {
    ...base,
    itens: descricoes.map((descricao, k) => ({
      n: k + 1,
      descricao,
      codigo: `N${k + 1}`,
      ean: null,
      qtd: 1,
      unidade: 'UN',
      vlUnit: 5,
      vlTotal: 5,
    })),
    total: descricoes.length * 5,
  };
}

const novo = (k: number): ProdutoId => `loc:${LOJA}:N${k}`;

async function preparar(base: Produto[]) {
  const ctx = criarContexto();
  for (const p of base) await ctx.repo.gravar(`produtos/${p.id}`, { ...p });
  return ctx;
}

type Ctx = Awaited<ReturnType<typeof preparar>>;

const produto = (ctx: Ctx, id: string) => ctx.repo.obter<Produto>(`produtos/${id}`);

describe('vínculo na gravação da nota (etiquetas + IA)', () => {
  it('mesmo bloco e mesma variante liga pela regra, sem chamar a IA', async () => {
    const det = produtoBase('D1', 'DET YPE COCO 500ML');
    const ctx = await preparar([det, produtoBase('D2', 'DET YPE LIMAO 500ML')]);
    await gravarNota(ctx, 'u', nota(['Det Ype 500ml Coco']), { veioDaFila: false });

    expect(await produto(ctx, novo(1))).toMatchObject({
      vinculadoA: det.id,
      vinculoOrigem: 'auto',
      vinculoMotivo: 'etiquetas',
      bloco: 'YPE|0.5L',
      etiquetas: { variantes: ['COCO'] },
    });
    expect(ctx.classificarVinculos).not.toHaveBeenCalled();
  });

  it('bloco vazio ou candidato só desta loja não chamam a IA', async () => {
    const ctx = await preparar([
      produtoBase('D1', 'DETERGENTE YPE COCO'),
      produtoBase('C1', 'REFR COCA COLA 2L', [LOJA]),
    ]);
    await gravarNota(ctx, 'u', nota(['DETERGENTE YPE COCO', 'REFR COCA COLA 2L']), {
      veioDaFila: false,
    });

    expect(await produto(ctx, novo(1))).toMatchObject({ bloco: null, vinculadoA: null });
    expect((await produto(ctx, novo(2)))?.vinculadoA).toBeNull();
    expect(ctx.classificarVinculos).not.toHaveBeenCalled();
  });

  it('dúvidas vão numa chamada só; id liga, A guarda candidatos, N não mexe', async () => {
    const coca = produtoBase('C1', 'REFR COCA COLA 2L');
    const integral = produtoBase('L1', 'LEITE LIDER 1L INTEGRAL');
    const desnatado = produtoBase('L2', 'LEITE LIDER 1L DESN');
    const cafe = produtoBase('K1', 'CAFE ITAMARATY 500G TRAD');
    const ctx = await preparar([coca, integral, desnatado, cafe]);
    ctx.classificarVinculos.mockImplementation(async (itens: ItemIa[]) => ({
      decisoes: itens.map((it) => ({
        i: it.i,
        r: it.d.startsWith('REFR') ? it.c[0].id : it.d.startsWith('LEITE') ? 'A' : 'N',
      })),
      custoUsd: 0.02,
    }));

    await gravarNota(
      ctx,
      'u',
      nota(['REFR COCA COLA 2L', 'LEITE LIDER 1L', 'CAFE ITAMARATY 500G']),
      { veioDaFila: false },
    );

    expect(ctx.classificarVinculos).toHaveBeenCalledOnce();
    const itens = ctx.classificarVinculos.mock.calls[0][0];
    expect(itens.map((it) => it.d)).toEqual([
      'REFR COCA COLA 2L',
      'LEITE LIDER 1L',
      'CAFE ITAMARATY 500G',
    ]);
    expect(itens[1].c.map((c) => c.id).sort()).toEqual([desnatado.id, integral.id].sort());
    expect(itens.every((it) => it.c.length >= 1 && it.c.length <= 5)).toBe(true);

    expect(await produto(ctx, novo(1))).toMatchObject({ vinculadoA: coca.id, vinculoMotivo: 'ia' });
    const leite = await produto(ctx, novo(2));
    expect(leite?.vinculadoA).toBeNull();
    expect(leite?.candidatosVinculo?.sort()).toEqual([desnatado.id, integral.id].sort());
    expect(await produto(ctx, novo(3))).toMatchObject({ vinculadoA: null });
    expect((await produto(ctx, novo(3)))?.candidatosVinculo).toBeUndefined();
    expect(await ctx.repo.obter(GASTO)).toEqual({ custoUsd: 0.02, chamadas: 1 });
  });

  it('mais de 40 dúvidas viram 2 chamadas em paralelo', async () => {
    const tamanhos = Array.from({ length: 41 }, (_, k) => 201 + k);
    const ctx = await preparar(tamanhos.map((ml) => produtoBase(`C${ml}`, `REFR COCA COLA ${ml}ML`)));
    await gravarNota(ctx, 'u', nota(tamanhos.map((ml) => `REFR COCA COLA ${ml}ML`)), {
      veioDaFila: false,
    });

    expect(ctx.classificarVinculos).toHaveBeenCalledTimes(2);
    expect(ctx.classificarVinculos.mock.calls.map((c) => c[0].length)).toEqual([21, 20]);
    expect(await ctx.repo.obter(GASTO)).toMatchObject({ chamadas: 2 });
  });

  it('teto do mês estourado: não chama a IA', async () => {
    const ctx = await preparar([produtoBase('C1', 'REFR COCA COLA 2L')]);
    await ctx.repo.gravar(GASTO, { custoUsd: IA_TETO_MENSAL_USD, chamadas: 100 });
    await gravarNota(ctx, 'u', nota(['REFR COCA COLA 2L']), { veioDaFila: false });

    expect(ctx.classificarVinculos).not.toHaveBeenCalled();
    expect(ctx.logs.find((l) => l.etapa === 'vinculo')).toMatchObject({ erro: 'teto-ia' });
  });

  it('IA com erro: nota gravada, preços publicados, nenhum vínculo e log de falha', async () => {
    const ctx = await preparar([produtoBase('C1', 'REFR COCA COLA 2L')]);
    ctx.classificarVinculos.mockRejectedValue(new Error('timeout'));
    const r = await gravarNota(ctx, 'u', nota(['REFR COCA COLA 2L']), { veioDaFila: false });

    expect(r).toEqual({ jaExistia: false, publicou: true });
    expect(await ctx.repo.obter(`usuarios/u/notas/${CHAVE}`)).not.toBeNull();
    expect(await ctx.repo.obter(`precos/${CHAVE}_1`)).not.toBeNull();
    expect((await produto(ctx, novo(1)))?.vinculadoA).toBeNull();
    const log = ctx.logs.find((l) => l.etapa === 'vinculo');
    expect(log).toMatchObject({ resultado: 'falha', erro: 'ia-erro' });
    expect(JSON.stringify(log)).not.toMatch(/COCA|loc:|03644587000836"/);
  });

  it('produto com vinculoBloqueado fica intocado', async () => {
    const coca = produtoBase('C1', 'REFR COCA COLA ZERO 2L');
    const bloqueado = { ...produtoBase('N1', 'REFR COCA COLA ZERO 2L', [LOJA]), vinculoBloqueado: true };
    const ctx = await preparar([coca, bloqueado]);
    await vincularNota(ctx, { chave: CHAVE, cnpj: LOJA } as Nota, [bloqueado.id]);

    expect(await produto(ctx, bloqueado.id)).toMatchObject({ vinculadoA: null, vinculoBloqueado: true });
    expect(ctx.classificarVinculos).not.toHaveBeenCalled();
  });

  it('reimportar a mesma chave não chama a IA de novo', async () => {
    const ctx = await preparar([produtoBase('C1', 'REFR COCA COLA 2L')]);
    const parsed = nota(['REFR COCA COLA 2L']);
    await gravarNota(ctx, 'u', parsed, { veioDaFila: false });
    await gravarNota(ctx, 'outro', parsed, { veioDaFila: false });

    expect(ctx.classificarVinculos).toHaveBeenCalledOnce();
  });

  it('republicar preserva os campos do vínculo', async () => {
    const coca = produtoBase('C1', 'REFR COCA COLA 2L');
    const ctx = await preparar([coca]);
    await ctx.repo.gravar(
      `produtos/${coca.id}`,
      { vinculoBloqueado: true, candidatosVinculo: ['ean:7894900027013'] },
      { merge: true },
    );
    const outra = { ...nota(['REFR COCA COLA 2L']), emitente: { ...notaExemplo().emitente, cnpj: OUTRA_LOJA } };
    outra.itens[0].codigo = 'C1';
    await gravarNota(ctx, 'u', outra, { veioDaFila: false });

    expect(await produto(ctx, coca.id)).toMatchObject({
      vinculoBloqueado: true,
      candidatosVinculo: ['ean:7894900027013'],
    });
  });
});
