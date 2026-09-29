import { describe, expect, it, vi } from 'vitest';
import type { Nota, Pendente, Preco, Produto } from '@shared/model';
import { executarConfirmacao } from '../src/importar/confirmar-nfce';
import { SefazIndisponivelError } from '../src/importar/erros';
import { logImportacao } from '../src/importar/log';
import {
  PREVIEW_TTL_MS,
  caminhoPreview,
  executarPreview,
  resolverEntrada,
} from '../src/importar/preview-nfce';
import { consumirRateLimit, LIMITE_POR_HORA } from '../src/importar/rate-limit';
import { executarEnfileirar, executarRetentar } from '../src/pendentes/enfileirar';
import {
  BACKOFF_APOS_FALHA_MS,
  executarReprocessamento,
} from '../src/pendentes/reprocessar-pendentes';
import {
  CHAVE,
  CHAVE_AGO,
  PAGINA_FORA,
  PAGINA_NOTA_OK,
  URL_QR,
  URL_QR_AGO,
  criarContexto,
  notaExemplo,
} from './apoio';

const UID_A = 'usuarioA';
const UID_B = 'usuarioB';

async function importar(ctx: ReturnType<typeof criarContexto>, uid: string, url = URL_QR) {
  const preview = await executarPreview(uid, { url }, ctx);
  expect(preview.ok).toBe(true);
  const chave = preview.ok ? preview.nota.chave : '';
  return executarConfirmacao(uid, { chave }, ctx);
}

describe('previewNfce', () => {
  it('sucesso: devolve a nota e guarda o preview por 30 min, sem dados do consumidor', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    const r = await executarPreview(UID_A, { url: URL_QR }, ctx);
    expect(r).toEqual({ ok: true, nota: notaExemplo() });
    const doc = ctx.repo.docs.get(caminhoPreview(UID_A, CHAVE))!;
    expect(doc['expiraEmIso']).toBe(
      new Date(ctx.relogio.agora.getTime() + PREVIEW_TTL_MS).toISOString(),
    );
    expect(JSON.stringify(r)).not.toMatch(/cpf|consumidor/i);
    expect(ctx.buscar).toHaveBeenCalledWith(URL_QR);
  });

  it('com a chave digitada, monta a URL v3', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await executarPreview(UID_A, { chave: CHAVE.replace(/(\d{4})/g, '$1 ') }, ctx);
    expect(ctx.buscar).toHaveBeenCalledWith(
      `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE}|3|1`,
    );
  });

  it.each([
    [{ url: 'https://evil.com/nfce/qrcode?p=1' }, 'url-invalida'],
    [{ chave: '123' }, 'chave-invalida'],
    [{}, 'url-invalida'],
  ])('entrada inválida %o → %s, sem buscar a SEFAZ', async (entrada, codigo) => {
    const ctx = criarContexto();
    const r = await executarPreview(UID_A, entrada, ctx);
    expect(r).toEqual({ ok: false, erro: { codigo } });
    expect(ctx.buscar).not.toHaveBeenCalled();
  });

  it('chave válida de outra UF → uf-nao-suportada', () => {
    const base = '35' + CHAVE.slice(2, 43);
    let dv = 0;
    for (; dv < 10; dv++) {
      try {
        resolverEntrada({ chave: base + dv });
      } catch (e) {
        if ((e as { codigo: string }).codigo === 'uf-nao-suportada') break;
      }
    }
    expect(dv).toBeLessThan(10);
  });

  it('ja-importada devolve a chave para abrir a nota', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await ctx.repo.gravar(`usuarios/${UID_A}/notas/${CHAVE}`, { chave: CHAVE });
    expect(await executarPreview(UID_A, { url: URL_QR }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'ja-importada', chave: CHAVE },
    });
  });

  it('rate-limit na 31ª chamada da hora, liberado na hora seguinte', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    for (let i = 0; i < LIMITE_POR_HORA; i++) {
      expect((await executarPreview(UID_A, { url: URL_QR }, ctx)).ok).toBe(true);
    }
    expect(await executarPreview(UID_A, { url: URL_QR }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'rate-limit' },
    });
    expect((await executarPreview(UID_B, { url: URL_QR }, ctx)).ok).toBe(true);
    ctx.relogio.agora = new Date(ctx.relogio.agora.getTime() + 60 * 60 * 1000);
    expect((await executarPreview(UID_A, { url: URL_QR }, ctx)).ok).toBe(true);
    expect(await consumirRateLimit(ctx.repo, 'x', ctx.agora(), 0)).toBe(false);
  });

  it('SEFAZ fora (página real "mal formatado") → sefaz-indisponivel, sem enfileirar', async () => {
    const ctx = criarContexto({ resposta: PAGINA_FORA });
    expect(await executarPreview(UID_A, { url: URL_QR }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'sefaz-indisponivel' },
    });
    expect(ctx.repo.colecao(`usuarios/${UID_A}/pendentes`)).toHaveLength(0);
  });

  it('timeout/rede → sefaz-indisponivel', async () => {
    const ctx = criarContexto();
    ctx.buscar.mockRejectedValueOnce(new SefazIndisponivelError());
    expect((await executarPreview(UID_A, { url: URL_QR }, ctx)).ok).toBe(false);
  });

  it('layout-inesperado registra o HTML para diagnóstico', async () => {
    const ctx = criarContexto({
      resposta: { status: 200, html: '<html>nada</html>', urlFinal: URL_QR },
    });
    expect(await executarPreview(UID_A, { url: URL_QR }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'layout-inesperado' },
    });
    expect(ctx.htmlRegistrado).toEqual(['<html>nada</html>']);
  });

  it('parser que falha ou devolve outra chave → layout-inesperado', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK, nota: notaExemplo(CHAVE_AGO) });
    expect(await executarPreview(UID_A, { url: URL_QR }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'layout-inesperado' },
    });
    const ctx2 = criarContexto({ resposta: PAGINA_NOTA_OK });
    ctx2.adaptador = () => ({
      pareceNota: () => true,
      parse: () => {
        throw new Error('quebrou');
      },
    });
    expect((await executarPreview(UID_A, { url: URL_QR }, ctx2)).ok).toBe(false);
    expect(ctx2.htmlRegistrado).toHaveLength(1);
  });

  it('erro inesperado é propagado (vira erro interno na callable)', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    ctx.repo.gravar = vi.fn(async () => {
      throw new Error('firestore caiu');
    });
    await expect(executarPreview(UID_A, { url: URL_QR }, ctx)).rejects.toThrow('firestore caiu');
  });
});

describe('confirmarNfce e publicação de preços', () => {
  it('primeira importação cria nota, perfil, estabelecimento, produtos e preços anônimos', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    expect(await importar(ctx, UID_A)).toEqual({ ok: true, chave: CHAVE });

    const nota = (await ctx.repo.obter<Nota>(`usuarios/${UID_A}/notas/${CHAVE}`))!;
    expect(nota.qtdItens).toBe(3);
    expect(nota.itens.map((i) => i.produtoId)).toEqual([
      'ean:7891000100103',
      'loc:03644587000836:2002',
      'ean:7896089011203',
    ]);
    expect(nota.itens[1].precoPorUnidadeBase).toEqual({ valor: 5.99, unidade: 'kg' });
    expect(nota.itens[2].precoPorUnidadeBase).toEqual({ valor: 43.8, unidade: 'kg' });
    expect(nota.veioDaFila).toBeUndefined();
    expect(await ctx.repo.obter(`usuarios/${UID_A}`)).toEqual({
      criadoEm: ctx.relogio.agora.toISOString(),
    });
    expect(await ctx.repo.obter(`estabelecimentos/03644587000836`)).toMatchObject({
      nome: 'SUPERMERCADO EXEMPLO LTDA',
    });
    expect(await ctx.repo.obter(`nfceImportadas/${CHAVE}`)).toMatchObject({ qtdUsuarios: 1 });

    const precos = ctx.repo.colecao('precos');
    expect(precos.map(([c]) => c).sort()).toEqual([
      `precos/${CHAVE}_1`,
      `precos/${CHAVE}_2`,
      `precos/${CHAVE}_3`,
    ]);
    for (const [, p] of precos) {
      expect(Object.keys(p).sort()).toEqual([
        'cnpj',
        'emissao',
        'precoPorUnidadeBase',
        'produtoId',
        'unidade',
        'vlUnit',
      ]);
      expect(JSON.stringify(p)).not.toContain(UID_A);
      expect(JSON.stringify(p)).not.toContain(CHAVE);
    }
    const leite = (await ctx.repo.obter<Produto>('produtos/ean:7891000100103'))!;
    expect(leite).toMatchObject({
      ean: '7891000100103',
      descricaoNorm: 'LEITE UHT INTEGRAL 1L',
      conteudo: { quantidade: 1, unidadeBase: 'L' },
      vinculadoA: null,
      menorPreco: { cnpj: '03644587000836', vlUnit: 4.49 },
    });
    expect(leite.tokens).toEqual(['LEITE', 'UHT', 'INTEGRAL', '1L']);
    expect(ctx.repo.docs.has(caminhoPreview(UID_A, CHAVE))).toBe(false);
  });

  it('a mesma chave por outro usuário cria só a nota dele, qtdUsuarios 2 e nenhum preço novo', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await importar(ctx, UID_A);
    const lotesAntes = ctx.repo.lotesExecutados;
    const precosAntes = JSON.stringify(ctx.repo.colecao('precos'));
    await importar(ctx, UID_B);
    expect(await ctx.repo.obter(`usuarios/${UID_B}/notas/${CHAVE}`)).not.toBeNull();
    expect(await ctx.repo.obter(`nfceImportadas/${CHAVE}`)).toMatchObject({ qtdUsuarios: 2 });
    expect(ctx.repo.lotesExecutados).toBe(lotesAntes);
    expect(JSON.stringify(ctx.repo.colecao('precos'))).toBe(precosAntes);
  });

  it('reimportar pelo mesmo usuário não duplica (preview avisa ja-importada)', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await importar(ctx, UID_A);
    expect(await executarPreview(UID_A, { url: URL_QR }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'ja-importada', chave: CHAVE },
    });
  });

  it('preview inexistente, de outro usuário ou vencido → preview-expirado', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    expect(await executarConfirmacao(UID_A, { chave: CHAVE }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'preview-expirado', chave: CHAVE },
    });
    await executarPreview(UID_A, { url: URL_QR }, ctx);
    ctx.relogio.agora = new Date(ctx.relogio.agora.getTime() + PREVIEW_TTL_MS + 1);
    expect((await executarConfirmacao(UID_A, { chave: CHAVE }, ctx)).ok).toBe(false);
    expect(await executarConfirmacao(UID_A, { chave: 'x' }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'chave-invalida' },
    });
  });

  it('nota com mais de 500 escritas publica em lotes', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK, nota: notaExemplo(CHAVE, 300) });
    await importar(ctx, UID_A);
    expect(ctx.repo.colecao('precos')).toHaveLength(300);
    expect(ctx.repo.lotesExecutados).toBe(2);
  });

  it('menor preço é atualizado por uma observação mais barata e a última observação pela mais recente', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await importar(ctx, UID_A);
    const barata = notaExemplo(CHAVE_AGO);
    barata.emissao = '2026-08-10T12:00:00.000Z';
    barata.emitente.cnpj = '11222333000181';
    barata.itens[0].vlUnit = 3.99;
    const ctx2 = { ...criarContexto({ resposta: PAGINA_NOTA_OK, nota: barata }), repo: ctx.repo };
    await importar(ctx2, UID_A, URL_QR_AGO);
    const leite = (await ctx.repo.obter<Produto>('produtos/ean:7891000100103'))!;
    expect(leite.menorPreco).toMatchObject({ vlUnit: 3.99, cnpj: '11222333000181' });
    expect(leite.ultimaObservacao).toMatchObject({ vlUnit: 4.49, cnpj: '03644587000836' });
    expect(leite.cnpjs).toEqual(['03644587000836', '11222333000181']);
  });

  it('falha na transação não publica preços', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await executarPreview(UID_A, { url: URL_QR }, ctx);
    ctx.repo.falharProximaTransacao = true;
    await expect(executarConfirmacao(UID_A, { chave: CHAVE }, ctx)).rejects.toThrow(
      'falha simulada',
    );
    expect(ctx.repo.colecao('precos')).toHaveLength(0);
    expect(ctx.repo.docs.has(caminhoPreview(UID_A, CHAVE))).toBe(true);
  });
});

describe('fila de pendentes (RF-10a)', () => {
  const HORA = 60 * 60 * 1000;

  it('enfileirar é idempotente e agenda a primeira tentativa em 15 min', async () => {
    const ctx = criarContexto();
    const r1 = await executarEnfileirar(UID_A, { url: URL_QR }, ctx);
    const r2 = await executarEnfileirar(UID_A, { url: URL_QR }, ctx);
    expect(r1).toEqual(r2);
    expect(r1).toEqual({ ok: true, chave: CHAVE, proximaTentativa: '2026-09-27T15:15:00.000Z' });
    const p = (await ctx.repo.obter<Pendente>(`usuarios/${UID_A}/pendentes/${CHAVE}`))!;
    expect(p).toMatchObject({ status: 'aguardando', tentativas: 0, url: URL_QR, ultimoErro: null });
    expect(await executarEnfileirar(UID_A, { url: 'https://evil.com' }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'url-invalida' },
    });
  });

  it('enfileirar nota já importada → ja-importada', async () => {
    const ctx = criarContexto();
    await ctx.repo.gravar(`usuarios/${UID_A}/notas/${CHAVE}`, { chave: CHAVE });
    expect(await executarEnfileirar(UID_A, { url: URL_QR }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'ja-importada', chave: CHAVE },
    });
  });

  it('SEFAZ fora: backoff 1 h → 6 h → 24 h → 24 h; volta: importa, publica e apaga o pendente', async () => {
    let fora = true;
    const ctx = criarContexto({ resposta: () => (fora ? PAGINA_FORA : PAGINA_NOTA_OK) });
    await executarEnfileirar(UID_A, { url: URL_QR }, ctx);
    const caminho = `usuarios/${UID_A}/pendentes/${CHAVE}`;

    expect(await executarReprocessamento(ctx)).toEqual({ importadas: 0, adiadas: 0, falharam: 0 });

    const esperas: number[] = [];
    for (let i = 0; i < 4; i++) {
      const p = (await ctx.repo.obter<Pendente>(caminho))!;
      ctx.relogio.agora = new Date(p.proximaTentativa);
      expect(await executarReprocessamento(ctx)).toEqual({
        importadas: 0,
        adiadas: 1,
        falharam: 0,
      });
      const depois = (await ctx.repo.obter<Pendente>(caminho))!;
      esperas.push(new Date(depois.proximaTentativa).getTime() - ctx.relogio.agora.getTime());
      expect(depois.tentativas).toBe(i + 1);
      expect(depois.ultimoErro).toBe('sefaz-indisponivel');
    }
    expect(esperas).toEqual([...BACKOFF_APOS_FALHA_MS, 24 * HORA]);

    fora = false;
    ctx.relogio.agora = new Date((await ctx.repo.obter<Pendente>(caminho))!.proximaTentativa);
    expect(await executarReprocessamento(ctx)).toEqual({ importadas: 1, adiadas: 0, falharam: 0 });
    expect(ctx.repo.docs.has(caminho)).toBe(false);
    const nota = (await ctx.repo.obter<Nota>(`usuarios/${UID_A}/notas/${CHAVE}`))!;
    expect(nota).toMatchObject({ veioDaFila: true, aberta: false });
    expect(ctx.repo.colecao('precos')).toHaveLength(3);
  });

  it('7 dias sem sucesso → falhou; retentativa manual reabre', async () => {
    const ctx = criarContexto({ resposta: PAGINA_FORA });
    await executarEnfileirar(UID_A, { url: URL_QR }, ctx);
    const caminho = `usuarios/${UID_A}/pendentes/${CHAVE}`;
    ctx.relogio.agora = new Date(ctx.relogio.agora.getTime() + 7 * 24 * HORA);
    expect(await executarReprocessamento(ctx)).toEqual({ importadas: 0, adiadas: 0, falharam: 1 });
    expect(await ctx.repo.obter<Pendente>(caminho)).toMatchObject({
      status: 'falhou',
      ultimoErro: 'sefaz-indisponivel',
    });

    expect(await executarReprocessamento(ctx)).toEqual({ importadas: 0, adiadas: 0, falharam: 0 });
    const r = await executarRetentar(UID_A, { chave: CHAVE }, ctx);
    expect(r).toEqual({
      ok: true,
      chave: CHAVE,
      proximaTentativa: ctx.relogio.agora.toISOString(),
    });
    expect(await executarReprocessamento(ctx)).toEqual({ importadas: 0, adiadas: 1, falharam: 0 });
    expect(await executarRetentar(UID_A, { chave: CHAVE_AGO }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'nao-encontrada', chave: CHAVE_AGO },
    });
    expect(await executarRetentar(UID_A, { chave: '1' }, ctx)).toEqual({
      ok: false,
      erro: { codigo: 'chave-invalida' },
    });
  });

  it('erro definitivo (layout, cancelada) → falhou com o motivo', async () => {
    const ctx = criarContexto({
      resposta: { status: 200, html: '<p>NFC-e CANCELADA</p>', urlFinal: URL_QR },
    });
    await executarEnfileirar(UID_A, { url: URL_QR }, ctx);
    ctx.relogio.agora = new Date(ctx.relogio.agora.getTime() + HORA);
    await executarReprocessamento(ctx);
    expect(await ctx.repo.obter(`usuarios/${UID_A}/pendentes/${CHAVE}`)).toMatchObject({
      status: 'falhou',
      ultimoErro: 'cancelada',
    });
  });

  it('processa no máximo 20 por execução, com 1 s entre fetches', async () => {
    const ctx = criarContexto({ resposta: PAGINA_FORA });
    const esperar = vi.fn(async () => undefined);
    ctx.esperar = esperar;
    for (let i = 0; i < 25; i++) {
      await ctx.repo.gravar(`usuarios/u${i}/pendentes/${CHAVE}`, {
        chave: CHAVE,
        url: URL_QR,
        status: 'aguardando',
        tentativas: 0,
        proximaTentativa: '2026-09-27T00:00:00.000Z',
        ultimoErro: null,
        criadaEm: '2026-09-27T00:00:00.000Z',
      });
    }
    await ctx.repo.gravar(`usuarios/x/pendentes/${CHAVE}`, {
      chave: CHAVE,
      url: 'https://evil.com',
      status: 'aguardando',
      tentativas: 0,
      proximaTentativa: '2026-01-01T00:00:00.000Z',
      ultimoErro: null,
      criadaEm: '2026-09-27T00:00:00.000Z',
    });
    const r = await executarReprocessamento(ctx);
    expect(r.adiadas + r.falharam).toBe(20);
    expect(esperar).toHaveBeenCalledTimes(19);
    expect(esperar).toHaveBeenCalledWith(1000);
    expect(await ctx.repo.obter('usuarios/x/pendentes/' + CHAVE)).toMatchObject({
      status: 'falhou',
      ultimoErro: 'url-invalida',
    });
  });
});

describe('log estruturado (RNF-30)', () => {
  it('uma linha por etapa numa importação completa, sem chave completa, uid ou CNPJ', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    ctx.log = (r) => logImportacao(r, logger);
    await importar(ctx, UID_A);
    const ctxFora = criarContexto({ resposta: PAGINA_FORA });
    ctxFora.log = (r) => logImportacao(r, logger);
    await executarPreview(UID_B, { url: URL_QR }, ctxFora);

    expect(logger.info).toHaveBeenCalledTimes(3);
    expect(logger.info.mock.calls.map((c) => c[1].etapa)).toEqual([
      'preview',
      'vinculo',
      'confirmacao',
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][1]).toMatchObject({
      etapa: 'preview',
      erro: 'sefaz-indisponivel',
      chavePrefixo: '412609',
    });
    const tudo = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(tudo).not.toContain(CHAVE);
    expect(tudo).not.toContain(UID_A);
    expect(tudo).not.toContain(UID_B);
    expect(tudo).not.toContain('03644587000836');
    expect(logger.info.mock.calls[0][1]).toMatchObject({
      uf: 'PR',
      qtdItens: 3,
      resultado: 'sucesso',
    });
  });
});
