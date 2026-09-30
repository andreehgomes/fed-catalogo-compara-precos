import { describe, expect, it } from 'vitest';
import type { Nota } from '@shared/model';
import { executarDefinirApelido } from '../src/estabelecimentos/definir-apelido';
import { executarConfirmacao } from '../src/importar/confirmar-nfce';
import { caminhoPreview, executarPreview } from '../src/importar/preview-nfce';
import { LIMITE_POR_HORA } from '../src/importar/rate-limit';
import { executarEnfileirar } from '../src/pendentes/enfileirar';
import { executarReprocessamento } from '../src/pendentes/reprocessar-pendentes';
import { CHAVE, PAGINA_NOTA_OK, URL_QR, criarContexto } from './apoio';

const UID = 'usuarioA';
const OUTRO_UID = 'usuarioB';
const CNPJ = '03644587000836';
const RAZAO = 'SUPERMERCADO EXEMPLO LTDA';
const APELIDO = 'Condor Pinheirinho';
const CAMINHO_APELIDO = `usuarios/${UID}/estabelecimentos/${CNPJ}`;
const CAMINHO_ESTAB = `estabelecimentos/${CNPJ}`;

type Ctx = ReturnType<typeof criarContexto>;

function contextoSemFantasia(): Ctx {
  const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
  ctx.consultarCnpj.mockResolvedValue({ status: 'ok', fonte: 'brasilapi', nomeFantasia: '' });
  return ctx;
}

async function notaAntiga(ctx: Ctx, uid: string, chave: string, cnpj = CNPJ) {
  await ctx.repo.gravar(`usuarios/${uid}/notas/${chave}`, {
    chave,
    cnpj,
    estabelecimentoNome: RAZAO,
    estabelecimentoCidade: 'CURITIBA',
  });
}

async function cenario(ctx: Ctx) {
  await notaAntiga(ctx, UID, 'antiga1');
  await notaAntiga(ctx, UID, 'antiga2');
  await notaAntiga(ctx, UID, 'outraLoja', '76189406000126');
  await notaAntiga(ctx, OUTRO_UID, 'antiga3');
}

async function nome(ctx: Ctx, uid: string, chave: string) {
  return (await ctx.repo.obter<Nota>(`usuarios/${uid}/notas/${chave}`))?.estabelecimentoNome;
}

async function gravarApelido(ctx: Ctx, apelido = APELIDO) {
  await ctx.repo.gravar(CAMINHO_APELIDO, { cnpj: CNPJ, apelido, atualizadoEm: 'x' });
}

async function gravarEstab(ctx: Ctx, extra: Record<string, unknown> = {}) {
  await ctx.repo.gravar(CAMINHO_ESTAB, {
    cnpj: CNPJ,
    nome: RAZAO,
    endereco: 'RUA DAS FLORES, 123',
    cidade: 'CURITIBA',
    uf: 'PR',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...extra,
  });
}

async function previa(ctx: Ctx) {
  const r = await executarPreview(UID, { url: URL_QR }, ctx);
  expect(r.ok).toBe(true);
  return r;
}

describe('prévia com apelido', () => {
  it('sem apelido, a resposta não tem `apelido`', async () => {
    const ctx = contextoSemFantasia();
    const r = await previa(ctx);
    expect(r).not.toHaveProperty('apelido');
  });

  it('com o documento do apelido, a resposta traz `apelido`', async () => {
    const ctx = contextoSemFantasia();
    await gravarApelido(ctx);
    expect(await previa(ctx)).toMatchObject({ ok: true, apelido: APELIDO });
  });
});

describe('confirmarNfce com apelido', () => {
  it('grava o apelido, nomeia a nota e propaga para as outras notas do uid', async () => {
    const ctx = contextoSemFantasia();
    await cenario(ctx);
    await previa(ctx);
    expect(await executarConfirmacao(UID, { chave: CHAVE, apelido: `  ${APELIDO} ` }, ctx)).toEqual(
      { ok: true, chave: CHAVE },
    );
    expect(await ctx.repo.obter(CAMINHO_APELIDO)).toEqual({
      cnpj: CNPJ,
      apelido: APELIDO,
      atualizadoEm: ctx.relogio.agora.toISOString(),
    });
    expect(await nome(ctx, UID, CHAVE)).toBe(APELIDO);
    expect(await nome(ctx, UID, 'antiga1')).toBe(APELIDO);
    expect(await nome(ctx, UID, 'antiga2')).toBe(APELIDO);
    expect(await nome(ctx, UID, 'outraLoja')).toBe(RAZAO);
    expect(await nome(ctx, OUTRO_UID, 'antiga3')).toBe(RAZAO);
    const estab = await ctx.repo.obter<Record<string, unknown>>(CAMINHO_ESTAB);
    expect(estab).toMatchObject({ nome: RAZAO });
    expect(JSON.stringify(estab)).not.toContain(APELIDO);
  });

  it.each([['x'], [42], ['x'.repeat(61)], [{}]])(
    'apelido inválido (%j): apelido-invalido e nada gravado',
    async (apelido) => {
      const ctx = contextoSemFantasia();
      await previa(ctx);
      expect(await executarConfirmacao(UID, { chave: CHAVE, apelido }, ctx)).toEqual({
        ok: false,
        erro: { codigo: 'apelido-invalido', chave: CHAVE },
      });
      expect(ctx.repo.docs.has(`usuarios/${UID}/notas/${CHAVE}`)).toBe(false);
      expect(ctx.repo.docs.has(CAMINHO_APELIDO)).toBe(false);
      expect(ctx.repo.colecao('precos')).toHaveLength(0);
      expect(ctx.repo.docs.has(caminhoPreview(UID, CHAVE))).toBe(true);
    },
  );

  it.each([[null], [RAZAO.toLowerCase()], ['']])(
    'apelido %j: nota com a razão social e nada de apelido',
    async (apelido) => {
      const ctx = contextoSemFantasia();
      await cenario(ctx);
      await previa(ctx);
      expect(await executarConfirmacao(UID, { chave: CHAVE, apelido }, ctx)).toMatchObject({
        ok: true,
      });
      expect(ctx.repo.docs.has(CAMINHO_APELIDO)).toBe(false);
      expect(await nome(ctx, UID, CHAVE)).toBe(RAZAO);
    },
  );

  it('apelido null mantém um apelido existente', async () => {
    const ctx = contextoSemFantasia();
    await gravarApelido(ctx);
    await previa(ctx);
    await executarConfirmacao(UID, { chave: CHAVE, apelido: null }, ctx);
    expect(await ctx.repo.obter(CAMINHO_APELIDO)).toMatchObject({ apelido: APELIDO });
    expect(await nome(ctx, UID, CHAVE)).toBe(APELIDO);
  });

  it('nota nova de loja com apelido já nasce com ele (confirmação sem apelido)', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await gravarApelido(ctx);
    await previa(ctx);
    await executarConfirmacao(UID, { chave: CHAVE }, ctx);
    expect(await nome(ctx, UID, CHAVE)).toBe(APELIDO);
  });

  it('nota nova de loja com apelido já nasce com ele (fila)', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await gravarApelido(ctx);
    await executarEnfileirar(UID, { url: URL_QR }, ctx);
    ctx.relogio.agora = new Date(ctx.relogio.agora.getTime() + 60 * 60 * 1000);
    expect(await executarReprocessamento(ctx)).toMatchObject({ importadas: 1 });
    expect(await nome(ctx, UID, CHAVE)).toBe(APELIDO);
  });

  it('falha na propagação não derruba a confirmação', async () => {
    const ctx = contextoSemFantasia();
    await cenario(ctx);
    await previa(ctx);
    const lote = ctx.repo.lote.bind(ctx.repo);
    let primeira = true;
    ctx.repo.lote = async (ops) => {
      if (primeira) {
        primeira = false;
        throw new Error('firestore caiu');
      }
      return lote(ops);
    };
    expect(await executarConfirmacao(UID, { chave: CHAVE, apelido: APELIDO }, ctx)).toEqual({
      ok: true,
      chave: CHAVE,
    });
    expect(await nome(ctx, UID, CHAVE)).toBe(APELIDO);
    expect(await ctx.repo.obter(CAMINHO_APELIDO)).toMatchObject({ apelido: APELIDO });
    expect(await nome(ctx, UID, 'antiga1')).toBe(RAZAO);
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({
        etapa: 'confirmacao',
        resultado: 'falha',
        contagens: { apelidoPropagacaoFalhou: 1 },
      }),
    );
  });
});

describe('definirApelido', () => {
  it('grava e propaga só para as notas do uid', async () => {
    const ctx = criarContexto();
    await gravarEstab(ctx, { fantasia: 'BOX ATACADISTA' });
    await cenario(ctx);
    expect(
      await executarDefinirApelido(UID, { cnpj: '03.644.587/0008-36', apelido: APELIDO }, ctx),
    ).toEqual({
      ok: true,
      apelido: APELIDO,
      notasAtualizadas: 2,
    });
    expect(await ctx.repo.obter(CAMINHO_APELIDO)).toMatchObject({ cnpj: CNPJ, apelido: APELIDO });
    expect(await nome(ctx, UID, 'antiga1')).toBe(APELIDO);
    expect(await nome(ctx, UID, 'antiga2')).toBe(APELIDO);
    expect(await nome(ctx, UID, 'outraLoja')).toBe(RAZAO);
    expect(await nome(ctx, OUTRO_UID, 'antiga3')).toBe(RAZAO);
    expect(await ctx.repo.obter(CAMINHO_ESTAB)).not.toHaveProperty('apelido');
  });

  it('null apaga e volta para fantasia || nome', async () => {
    const ctx = criarContexto();
    await gravarEstab(ctx, { fantasia: 'BOX ATACADISTA' });
    await cenario(ctx);
    await executarDefinirApelido(UID, { cnpj: CNPJ, apelido: APELIDO }, ctx);
    expect(await executarDefinirApelido(UID, { cnpj: CNPJ, apelido: null }, ctx)).toEqual({
      ok: true,
      apelido: null,
      notasAtualizadas: 2,
    });
    expect(ctx.repo.docs.has(CAMINHO_APELIDO)).toBe(false);
    expect(await nome(ctx, UID, 'antiga1')).toBe('BOX ATACADISTA');
    expect(ctx.logs.at(-1)).toMatchObject({
      etapa: 'apelido',
      resultado: 'sucesso',
      contagens: { notasAtualizadas: 2, removido: 1 },
    });
  });

  it('sem nome fantasia, apagar volta para a razão social', async () => {
    const ctx = criarContexto();
    await gravarEstab(ctx);
    await cenario(ctx);
    await executarDefinirApelido(UID, { cnpj: CNPJ, apelido: APELIDO }, ctx);
    await executarDefinirApelido(UID, { cnpj: CNPJ }, ctx);
    expect(await nome(ctx, UID, 'antiga1')).toBe(RAZAO);
  });

  it.each([[''], ['12345678000100'], [undefined]])(
    'CNPJ inválido (%j) → nao-encontrada',
    async (cnpj) => {
      const ctx = criarContexto();
      expect(await executarDefinirApelido(UID, { cnpj, apelido: APELIDO }, ctx)).toEqual({
        ok: false,
        erro: { codigo: 'nao-encontrada' },
      });
    },
  );

  it('CNPJ sem estabelecimento → nao-encontrada', async () => {
    const ctx = criarContexto();
    expect(await executarDefinirApelido(UID, { cnpj: CNPJ, apelido: APELIDO }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'nao-encontrada' },
    });
  });

  it.each([['x'], ['***'], [42]])('apelido inválido (%j) → apelido-invalido', async (apelido) => {
    const ctx = criarContexto();
    await gravarEstab(ctx);
    await cenario(ctx);
    expect(await executarDefinirApelido(UID, { cnpj: CNPJ, apelido }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'apelido-invalido' },
    });
    expect(ctx.repo.docs.has(CAMINHO_APELIDO)).toBe(false);
    expect(await nome(ctx, UID, 'antiga1')).toBe(RAZAO);
  });

  it('rate limit', async () => {
    const ctx = criarContexto();
    await gravarEstab(ctx);
    for (let i = 0; i < LIMITE_POR_HORA; i++)
      expect((await executarDefinirApelido(UID, { cnpj: CNPJ, apelido: APELIDO }, ctx)).ok).toBe(
        true,
      );
    expect(await executarDefinirApelido(UID, { cnpj: CNPJ, apelido: APELIDO }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'rate-limit' },
    });
  });

  it('erro inesperado é propagado', async () => {
    const ctx = criarContexto();
    await gravarEstab(ctx);
    ctx.repo.lote = async () => {
      throw new Error('firestore caiu');
    };
    await expect(
      executarDefinirApelido(UID, { cnpj: CNPJ, apelido: APELIDO }, ctx),
    ).rejects.toThrow('firestore caiu');
  });
});

describe('log sem apelido nem CNPJ', () => {
  it('confirmação e definirApelido', async () => {
    const ctx = contextoSemFantasia();
    await cenario(ctx);
    await previa(ctx);
    await executarConfirmacao(UID, { chave: CHAVE, apelido: APELIDO }, ctx);
    await executarDefinirApelido(UID, { cnpj: CNPJ, apelido: 'Mercado da Esquina' }, ctx);
    await executarDefinirApelido(UID, { cnpj: CNPJ, apelido: 'x' }, ctx);
    const logs = JSON.stringify(
      ctx.logs.map(({ chave, ...r }) => ({ ...r, prefixo: chave?.slice(0, 6) })),
    );
    expect(logs).not.toContain(APELIDO);
    expect(logs).not.toContain('Mercado da Esquina');
    expect(logs).not.toContain(CNPJ);
  });
});
