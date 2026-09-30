import { describe, expect, it } from 'vitest';
import type { Estabelecimento, Nota } from '@shared/model';
import { executarPreview } from '../src/importar/preview-nfce';
import { LIMITE_POR_HORA } from '../src/importar/rate-limit';
import { CHAVE, CHAVE_AGO, PAGINA_FORA, PAGINA_NOTA_OK, URL_QR, criarContexto } from './apoio';

const UID = 'usuarioA';
const OUTRO_UID = 'usuarioB';
const CNPJ = '03644587000836';
const OUTRO_CNPJ = '76189406000126';
const RAZAO = 'SUPERMERCADO EXEMPLO LTDA';
const CHAVE_OUTRA_LOJA = '41260976189406000126650010000000011000000019';

type Ctx = ReturnType<typeof criarContexto>;

async function gravarNota(ctx: Ctx, uid: string, chave: string, cnpj: string, cidade = 'CURITIBA') {
  await ctx.repo.gravar(`usuarios/${uid}/notas/${chave}`, {
    chave,
    cnpj,
    estabelecimentoNome: RAZAO,
    estabelecimentoCidade: cidade,
  });
}

async function cenario(ctx: Ctx, estab: Partial<Estabelecimento> | null, cidadeNotas = 'CURITIBA') {
  await gravarNota(ctx, UID, CHAVE, CNPJ, cidadeNotas);
  await gravarNota(ctx, UID, CHAVE_AGO, CNPJ, cidadeNotas);
  await gravarNota(ctx, OUTRO_UID, CHAVE, CNPJ, cidadeNotas);
  await gravarNota(ctx, UID, CHAVE_OUTRA_LOJA, OUTRO_CNPJ);
  if (estab)
    await ctx.repo.gravar(`estabelecimentos/${CNPJ}`, {
      cnpj: CNPJ,
      nome: RAZAO,
      endereco: 'RUA DAS FLORES, 123, CENTRO, CURITIBA, PR',
      cidade: 'CURITIBA',
      uf: 'PR',
      atualizadoEm: '2026-01-01T00:00:00.000Z',
      ...estab,
    });
}

function diasAtras(ctx: Ctx, dias: number): string {
  return new Date(ctx.relogio.agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}

async function nota(ctx: Ctx, uid: string, chave: string) {
  return (await ctx.repo.obter<Nota>(`usuarios/${uid}/notas/${chave}`))!;
}

const JA_IMPORTADA = { ok: false, erro: { codigo: 'ja-importada', chave: CHAVE } };
const ATUALIZADA = {
  ok: false,
  erro: { codigo: 'ja-importada', chave: CHAVE, estabelecimentoAtualizado: true },
};

describe('reimportação atualiza o estabelecimento', () => {
  it('completo: nenhuma chamada externa e resposta de sempre', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await cenario(ctx, { fantasia: 'BOX', fantasiaConsultadaEm: diasAtras(ctx, 10) });
    const antes = JSON.stringify(
      [...ctx.repo.docs.entries()].filter(([c]) => !c.startsWith('rateLimit')),
    );
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(JA_IMPORTADA);
    expect(ctx.buscar).not.toHaveBeenCalled();
    expect(ctx.consultarCnpj).not.toHaveBeenCalled();
    expect(
      JSON.stringify([...ctx.repo.docs.entries()].filter(([c]) => !c.startsWith('rateLimit'))),
    ).toBe(antes);
  });

  it('só falta o nome fantasia: consulta o CNPJ e atualiza as notas deste uid', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await cenario(ctx, {});
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(ATUALIZADA);
    expect(ctx.buscar).not.toHaveBeenCalled();
    expect(ctx.consultarCnpj).toHaveBeenCalledTimes(1);

    expect(await ctx.repo.obter(`estabelecimentos/${CNPJ}`)).toMatchObject({
      fantasia: 'BOX ATACADISTA',
      fantasiaConsultadaEm: ctx.relogio.agora.toISOString(),
      atualizadoEm: ctx.relogio.agora.toISOString(),
    });
    expect((await nota(ctx, UID, CHAVE)).estabelecimentoNome).toBe('BOX ATACADISTA');
    expect((await nota(ctx, UID, CHAVE_AGO)).estabelecimentoNome).toBe('BOX ATACADISTA');
    expect((await nota(ctx, OUTRO_UID, CHAVE)).estabelecimentoNome).toBe(RAZAO);
    expect((await nota(ctx, UID, CHAVE_OUTRA_LOJA)).estabelecimentoNome).toBe(RAZAO);
  });

  it('estabelecimento sem cidade: relê a SEFAZ e completa a cidade nas notas', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await cenario(ctx, { cidade: '', fantasiaConsultadaEm: diasAtras(ctx, 10) }, '');
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(ATUALIZADA);
    expect(ctx.buscar).toHaveBeenCalledWith(URL_QR);
    expect(ctx.consultarCnpj).not.toHaveBeenCalled();
    expect((await ctx.repo.obter<Estabelecimento>(`estabelecimentos/${CNPJ}`))!.cidade).toBe(
      'CURITIBA',
    );
    expect((await nota(ctx, UID, CHAVE)).estabelecimentoCidade).toBe('CURITIBA');
    expect((await nota(ctx, UID, CHAVE_AGO)).estabelecimentoCidade).toBe('CURITIBA');
    expect((await nota(ctx, OUTRO_UID, CHAVE)).estabelecimentoCidade).toBe('');
  });

  it('estabelecimento inexistente: relê a SEFAZ e cria o documento', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await cenario(ctx, null);
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(ATUALIZADA);
    expect(ctx.buscar).toHaveBeenCalledTimes(1);
    expect(ctx.consultarCnpj).toHaveBeenCalledTimes(1);
    expect(await ctx.repo.obter(`estabelecimentos/${CNPJ}`)).toMatchObject({
      cnpj: CNPJ,
      nome: RAZAO,
      fantasia: 'BOX ATACADISTA',
      cidade: 'CURITIBA',
    });
  });

  it('SEFAZ indisponível: ja-importada sem o flag, nada gravado e log de falha', async () => {
    const ctx = criarContexto({ resposta: PAGINA_FORA });
    await cenario(ctx, null);
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(JA_IMPORTADA);
    expect(ctx.repo.docs.has(`estabelecimentos/${CNPJ}`)).toBe(false);
    expect((await nota(ctx, UID, CHAVE)).estabelecimentoNome).toBe(RAZAO);
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ etapa: 'cnpj', resultado: 'falha', erro: 'sefaz-indisponivel' }),
    );
    expect(JSON.stringify(ctx.logs.filter((l) => l.etapa === 'cnpj'))).not.toContain(CNPJ);
  });

  it('consulta do CNPJ falhando: ja-importada sem o flag e nada gravado', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await cenario(ctx, {});
    ctx.consultarCnpj.mockRejectedValue(new Error('cnpj-indisponivel'));
    const antes = await ctx.repo.obter(`estabelecimentos/${CNPJ}`);
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(JA_IMPORTADA);
    expect(await ctx.repo.obter(`estabelecimentos/${CNPJ}`)).toEqual(antes);
    expect((await nota(ctx, UID, CHAVE)).estabelecimentoNome).toBe(RAZAO);
  });

  it('erro ao gravar não muda a resposta', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await cenario(ctx, {});
    ctx.repo.lote = async () => {
      throw new Error('firestore caiu');
    };
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(JA_IMPORTADA);
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ etapa: 'cnpj', resultado: 'falha', erro: 'desconhecido' }),
    );
  });

  it('a reimportação continua consumindo o rate limit', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await cenario(ctx, { fantasia: 'BOX', fantasiaConsultadaEm: diasAtras(ctx, 10) });
    for (let i = 0; i < LIMITE_POR_HORA; i++)
      expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(JA_IMPORTADA);
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'rate-limit' },
    });
  });
});

describe('reimportação respeita o apelido', () => {
  it('o nome fantasia chega, mas as notas continuam com o apelido', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await cenario(ctx, {});
    await ctx.repo.gravar(`usuarios/${UID}/estabelecimentos/${CNPJ}`, {
      cnpj: CNPJ,
      apelido: 'Mercado da Esquina',
      atualizadoEm: '2026-09-01T00:00:00.000Z',
    });
    await ctx.repo.gravar(
      `usuarios/${UID}/notas/${CHAVE}`,
      { estabelecimentoNome: 'Mercado da Esquina' },
      { merge: true },
    );
    expect(await executarPreview(UID, { url: URL_QR }, ctx)).toEqual(ATUALIZADA);
    expect(await ctx.repo.obter(`estabelecimentos/${CNPJ}`)).toMatchObject({
      fantasia: 'BOX ATACADISTA',
    });
    expect((await nota(ctx, UID, CHAVE)).estabelecimentoNome).toBe('Mercado da Esquina');
    expect((await nota(ctx, UID, CHAVE_AGO)).estabelecimentoNome).toBe('Mercado da Esquina');
    expect((await nota(ctx, OUTRO_UID, CHAVE)).estabelecimentoNome).toBe(RAZAO);
  });
});
