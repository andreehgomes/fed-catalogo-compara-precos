import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemNome } from '../src/nome/ia-nome';
import { nomearItens } from '../src/nome/nomear-itens';
import {
  CACHE_CONFIG_IA_MS,
  CAMINHO_CONFIG_IA,
  limparCacheConfigIa,
  obterModelos,
} from '../src/ia/config-ia-firestore';
import { executarDefinirConfigIa, executarObterConfigIa } from '../src/ia/configurar-ia';
import { parametrosDoModelo } from '../src/ia/modelos';
import { caminhoGastoIa } from '../src/vinculo/vincular-nota';
import { criarContexto, notaExemplo } from './apoio';

const ADMIN = 'admin1';
const PADRAO = { modeloNome: 'claude-opus-5-5', modeloVinculo: 'claude-opus-5-5' };

beforeEach(() => limparCacheConfigIa());

describe('parametrosDoModelo', () => {
  it('Opus e Sonnet com o fallback server-side; Haiku sem os dois campos', () => {
    expect(parametrosDoModelo('claude-opus-5-5')).toEqual({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(parametrosDoModelo('claude-sonnet-5-5')).toMatchObject({ fallbacks: 'default' });
    expect(parametrosDoModelo('claude-haiku-5-5')).toEqual({ model: 'claude-haiku-5-5' });
  });
});

describe('obterModelos', () => {
  it('sem documento: Opus nas duas chamadas', async () => {
    expect(await obterModelos(criarContexto())).toEqual(PADRAO);
  });

  it('lê o documento e guarda por 60 s; depois relê', async () => {
    const ctx = criarContexto();
    await ctx.repo.gravar(CAMINHO_CONFIG_IA, {
      modeloNome: 'claude-haiku-5-5',
      modeloVinculo: 'claude-sonnet-5-5',
    });
    expect(await obterModelos(ctx)).toEqual({
      modeloNome: 'claude-haiku-5-5',
      modeloVinculo: 'claude-sonnet-5-5',
    });
    await ctx.repo.gravar(CAMINHO_CONFIG_IA, PADRAO);
    expect((await obterModelos(ctx)).modeloNome).toBe('claude-haiku-5-5');
    ctx.relogio.agora = new Date(ctx.relogio.agora.getTime() + CACHE_CONFIG_IA_MS + 1);
    expect((await obterModelos(ctx)).modeloNome).toBe('claude-opus-5-5');
  });

  it('leitura que falha usa o padrão', async () => {
    const ctx = criarContexto();
    ctx.repo.obter = async () => {
      throw new Error('firestore');
    };
    expect(await obterModelos(ctx)).toEqual(PADRAO);
  });

  it('a etapa de nome usa o modelo da config e põe o modelo no log', async () => {
    const ctx = criarContexto();
    await ctx.repo.gravar(CAMINHO_CONFIG_IA, { ...PADRAO, modeloNome: 'claude-haiku-5-5' });
    ctx.normalizarNomes.mockImplementation(async (_itens: ItemNome[]) => ({
      nomes: new Map(),
      custoUsd: 0,
      chamadas: 1,
    }));
    await nomearItens(ctx, notaExemplo());
    expect(ctx.normalizarNomes.mock.calls[0][1]).toBe('claude-haiku-5-5');
    expect(ctx.logs.find((l) => l.etapa === 'nome')).toMatchObject({ modelo: 'claude-haiku-5-5' });
  });
});

describe('callables de configuração', () => {
  it('quem não é admin não lê nem grava', async () => {
    const ctx = criarContexto();
    expect(await executarObterConfigIa('outro', [ADMIN], ctx)).toEqual({
      ok: false,
      erro: { codigo: 'nao-autorizado' },
    });
    expect(
      await executarDefinirConfigIa(
        'outro',
        [ADMIN],
        { ...PADRAO, modeloNome: 'claude-haiku-5-5' },
        ctx,
      ),
    ).toEqual({ ok: false, erro: { codigo: 'nao-autorizado' } });
    expect(await ctx.repo.obter(CAMINHO_CONFIG_IA)).toBeNull();
  });

  it('admin lê a config (padrão sem documento) e o gasto do mês', async () => {
    const ctx = criarContexto();
    const gasto = {
      custoUsd: 0.3,
      chamadas: 5,
      porEtapa: { nome: { custoUsd: 0.3, chamadas: 5 } },
    };
    await ctx.repo.gravar(caminhoGastoIa(ctx.agora()), gasto);
    expect(await executarObterConfigIa(ADMIN, [ADMIN], ctx)).toEqual({
      ok: true,
      config: PADRAO,
      gasto,
    });
  });

  it('admin grava ids válidos, a instância usa na hora; id fora da lista é recusado', async () => {
    const ctx = criarContexto();
    expect(await obterModelos(ctx)).toEqual(PADRAO);
    const nova = { modeloNome: 'claude-haiku-5-5', modeloVinculo: 'claude-opus-5-5' };
    expect(await executarDefinirConfigIa(ADMIN, [ADMIN], nova, ctx)).toEqual({
      ok: true,
      config: nova,
    });
    expect(await ctx.repo.obter(CAMINHO_CONFIG_IA)).toMatchObject(nova);
    expect(await obterModelos(ctx)).toEqual(nova);
    expect(
      await executarDefinirConfigIa(
        ADMIN,
        [ADMIN],
        { modeloNome: 'gpt-5', modeloVinculo: 'x' },
        ctx,
      ),
    ).toEqual({ ok: false, erro: { codigo: 'modelo-invalido' } });
    expect(await ctx.repo.obter(CAMINHO_CONFIG_IA)).toMatchObject(nova);
    expect(JSON.stringify(ctx.logs)).not.toContain(ADMIN);
  });
});
