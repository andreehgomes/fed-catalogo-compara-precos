import { describe, expect, it } from 'vitest';
import type { Produto, ProdutoId } from '@shared/model';
import { LIMITE_POR_HORA } from '../src/importar/rate-limit';
import { executarDesvincular, executarVincular } from '../src/produtos/vincular-produto';
import { criarContexto } from './apoio';

const LEITE_EAN = 'ean:7891000100103' as ProdutoId;
const OUTRO_EAN = 'ean:7894900011517' as ProdutoId;
const LEITE_A = 'loc:03644587000836:1001' as ProdutoId;
const LEITE_B = 'loc:11222333000181:77' as ProdutoId;
const LEITE_C = 'loc:11222333000181:88' as ProdutoId;

function produto(id: ProdutoId, vinculadoA: ProdutoId | null = null): Produto {
  return {
    id,
    ean: id.startsWith('ean:') ? id.slice(4) : null,
    descricao: 'LEITE UHT INT 1L',
    descricaoNorm: 'LEITE UHT INTEGRAL 1L',
    tokens: ['LEITE', 'UHT', 'INTEGRAL', '1L'],
    conteudo: { quantidade: 1, unidadeBase: 'L' },
    vinculadoA,
    menorPreco: null,
    ultimaObservacao: null,
  };
}

async function base() {
  const ctx = criarContexto();
  for (const p of [
    produto(LEITE_EAN),
    produto(OUTRO_EAN),
    produto(LEITE_A),
    produto(LEITE_B),
    produto(LEITE_C),
  ]) {
    await ctx.repo.gravar(`produtos/${p.id}`, { ...p });
  }
  return ctx;
}

const vinculado = async (ctx: Awaited<ReturnType<typeof base>>, id: ProdutoId) =>
  (await ctx.repo.obter<Produto>(`produtos/${id}`))!.vinculadoA;

describe('vincularProduto', () => {
  it('loc do mercado A → EAN do leite: o EAN é o canônico', async () => {
    const ctx = await base();
    expect(await executarVincular('u1', { origem: LEITE_A, destino: LEITE_EAN }, ctx)).toEqual({
      ok: true,
      canonico: LEITE_EAN,
    });
    expect(await vinculado(ctx, LEITE_A)).toBe(LEITE_EAN);
    expect(ctx.logs.at(-1)).toMatchObject({ etapa: 'vinculo', resultado: 'sucesso' });
    expect(JSON.stringify(ctx.logs)).not.toContain('u1');
  });

  it('EAN como origem e loc como destino: o EAN continua canônico', async () => {
    const ctx = await base();
    expect(await executarVincular('u1', { origem: LEITE_EAN, destino: LEITE_A }, ctx)).toEqual({
      ok: true,
      canonico: LEITE_EAN,
    });
    expect(await vinculado(ctx, LEITE_A)).toBe(LEITE_EAN);
    expect(await vinculado(ctx, LEITE_EAN)).toBeNull();
  });

  it('dois EANs distintos são recusados', async () => {
    const ctx = await base();
    expect(await executarVincular('u1', { origem: OUTRO_EAN, destino: LEITE_EAN }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'eans-distintos' },
    });
    await executarVincular('u1', { origem: LEITE_A, destino: OUTRO_EAN }, ctx);
    expect(await executarVincular('u1', { origem: LEITE_A, destino: LEITE_EAN }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'eans-distintos' },
    });
  });

  it('segue a cadeia até o canônico e reaponta quem apontava para a origem (sem ciclo)', async () => {
    const ctx = await base();
    await executarVincular('u1', { origem: LEITE_B, destino: LEITE_A }, ctx);
    await executarVincular('u1', { origem: LEITE_C, destino: LEITE_A }, ctx);
    expect(await vinculado(ctx, LEITE_B)).toBe(LEITE_A);
    await executarVincular('u1', { origem: LEITE_A, destino: LEITE_EAN }, ctx);
    expect(await vinculado(ctx, LEITE_A)).toBe(LEITE_EAN);
    expect(await vinculado(ctx, LEITE_B)).toBe(LEITE_EAN);
    expect(await vinculado(ctx, LEITE_C)).toBe(LEITE_EAN);

    expect(await executarVincular('u1', { origem: LEITE_EAN, destino: LEITE_B }, ctx)).toEqual({
      ok: true,
      canonico: LEITE_EAN,
    });
    expect(await vinculado(ctx, LEITE_EAN)).toBeNull();
  });

  it('ciclo já existente na base é detectado', async () => {
    const ctx = await base();
    await ctx.repo.gravar(`produtos/${LEITE_A}`, { ...produto(LEITE_A, LEITE_B) });
    await ctx.repo.gravar(`produtos/${LEITE_B}`, { ...produto(LEITE_B, LEITE_A) });
    expect(await executarVincular('u1', { origem: LEITE_C, destino: LEITE_A }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'ciclo' },
    });
  });

  it.each([
    [{ origem: 'x', destino: LEITE_EAN }, 'produto-invalido'],
    [{ origem: LEITE_A, destino: LEITE_A }, 'mesmo-produto'],
    [{ origem: LEITE_A, destino: 'ean:12345678' }, 'produto-inexistente'],
    [null, 'produto-invalido'],
  ])('entrada %o → %s', async (entrada, codigo) => {
    const ctx = await base();
    expect(await executarVincular('u1', entrada as never, ctx)).toEqual({
      ok: false,
      erro: { codigo },
    });
  });

  it('aplica o rate limit da importação', async () => {
    const ctx = await base();
    for (let i = 0; i < LIMITE_POR_HORA; i++)
      await executarVincular('u1', { origem: LEITE_A, destino: LEITE_EAN }, ctx);
    expect(await executarVincular('u1', { origem: LEITE_B, destino: LEITE_EAN }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'rate-limit' },
    });
  });
});

describe('desvincularProduto', () => {
  it('remove o vínculo', async () => {
    const ctx = await base();
    await executarVincular('u1', { origem: LEITE_A, destino: LEITE_EAN }, ctx);
    expect(await executarDesvincular({ id: LEITE_A }, ctx)).toEqual({
      ok: true,
      canonico: LEITE_A,
    });
    expect(await vinculado(ctx, LEITE_A)).toBeNull();
    expect(await executarDesvincular({ id: 'x' }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'produto-invalido' },
    });
    expect(await executarDesvincular({ id: 'ean:12345678' }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'produto-inexistente' },
    });
  });
});
