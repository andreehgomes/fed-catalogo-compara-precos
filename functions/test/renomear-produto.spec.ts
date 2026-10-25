import { describe, expect, it } from 'vitest';
import type { Nota, Produto } from '@shared/model';
import { gravarNota } from '../src/importar/gravar-nota';
import { LIMITE_POR_HORA } from '../src/importar/rate-limit';
import { executarRenomearProduto } from '../src/produtos/renomear-produto';
import { CHAVE, criarContexto, notaExemplo } from './apoio';

const CAFE = 'ean:7896089011203';
const OUTRA_CHAVE = '41260903644587000836652100000168701620438548';

async function comNotas() {
  const ctx = criarContexto();
  await gravarNota(ctx, 'u', notaExemplo(), { veioDaFila: false });
  await gravarNota(ctx, 'outro', notaExemplo(OUTRA_CHAVE), { veioDaFila: false });
  return ctx;
}

const nota = (ctx: Awaited<ReturnType<typeof comNotas>>, uid: string, chave: string) =>
  ctx.repo.obter<Nota>(`usuarios/${uid}/notas/${chave}`);

describe('renomearProduto', () => {
  it('grava o nome manual no produto e nas notas deste uid, só no item do produto', async () => {
    const ctx = await comNotas();
    const r = await executarRenomearProduto(
      'u',
      { id: CAFE, nome: '  Café Pilão   Tradicional ' },
      ctx,
    );

    expect(r).toEqual({ ok: true, nome: 'Café Pilão Tradicional', notasAtualizadas: 1 });
    expect(await ctx.repo.obter<Produto>(`produtos/${CAFE}`)).toMatchObject({
      nome: 'Café Pilão Tradicional',
      nomeOrigem: 'manual',
      descricao: 'CAFE PILAO 500G',
    });
    const minha = (await nota(ctx, 'u', CHAVE))!;
    expect(minha.itens.map((i) => i.nome ?? null)).toEqual([null, null, 'Café Pilão Tradicional']);
    expect((await nota(ctx, 'outro', OUTRA_CHAVE))!.itens[2].nome).toBeUndefined();
    expect(ctx.logs.at(-1)).toMatchObject({
      etapa: 'nome-manual',
      resultado: 'sucesso',
      contagens: { notasAtualizadas: 1 },
    });
    expect(JSON.stringify(ctx.logs.at(-1))).not.toMatch(/Café|7896089011203/);
  });

  it('repetir o mesmo nome não reescreve notas', async () => {
    const ctx = await comNotas();
    await executarRenomearProduto('u', { id: CAFE, nome: 'Café Pilão' }, ctx);
    expect(await executarRenomearProduto('u', { id: CAFE, nome: 'Café Pilão' }, ctx)).toEqual({
      ok: true,
      nome: 'Café Pilão',
      notasAtualizadas: 0,
    });
  });

  it('id inválido, nome inválido e produto inexistente são recusados antes de gravar', async () => {
    const ctx = await comNotas();
    const antes = JSON.stringify([...ctx.repo.docs].filter(([c]) => !c.startsWith('rateLimit/')));
    for (const [entrada, codigo] of [
      [{ id: 'xyz', nome: 'Café' }, 'produto-invalido'],
      [null, 'produto-invalido'],
      [{ id: CAFE, nome: '1' }, 'nome-invalido'],
      [{ id: CAFE, nome: 42 }, 'nome-invalido'],
      [{ id: CAFE, nome: 'a'.repeat(81) }, 'nome-invalido'],
      [{ id: 'ean:7891234567895', nome: 'Café' }, 'produto-inexistente'],
    ] as const)
      expect(await executarRenomearProduto('u', entrada, ctx)).toEqual({
        ok: false,
        erro: { codigo },
      });
    expect(JSON.stringify([...ctx.repo.docs].filter(([c]) => !c.startsWith('rateLimit/')))).toBe(
      antes,
    );
  });

  it('respeita o rate limit da importação', async () => {
    const ctx = await comNotas();
    for (let k = 0; k < LIMITE_POR_HORA; k++)
      await executarRenomearProduto('u', { id: CAFE, nome: `Café ${k}` }, ctx);
    expect(await executarRenomearProduto('u', { id: CAFE, nome: 'Café final' }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'rate-limit' },
    });
  });

  it('uma nota nova depois não desfaz o nome manual', async () => {
    const ctx = await comNotas();
    await executarRenomearProduto('u', { id: CAFE, nome: 'Café do usuário' }, ctx);
    const nova = notaExemplo('41260903644587000836652100000168701620438549');
    nova.itens[2] = { ...nova.itens[2], nome: 'Café Pilão 500 g' };
    await gravarNota(ctx, 'u', nova, { veioDaFila: false });
    expect(await ctx.repo.obter<Produto>(`produtos/${CAFE}`)).toMatchObject({
      nome: 'Café do usuário',
      nomeOrigem: 'manual',
    });
  });
});
