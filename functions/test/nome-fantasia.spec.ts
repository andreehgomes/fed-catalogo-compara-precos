import { describe, expect, it } from 'vitest';
import type { Estabelecimento, Nota } from '@shared/model';
import { executarConfirmacao } from '../src/importar/confirmar-nfce';
import { caminhoPreview, executarPreview, type DocPreview } from '../src/importar/preview-nfce';
import { executarEnfileirar } from '../src/pendentes/enfileirar';
import { executarReprocessamento } from '../src/pendentes/reprocessar-pendentes';
import { CHAVE, PAGINA_NOTA_OK, URL_QR, criarContexto } from './apoio';

const UID = 'usuarioA';
const CNPJ = '03644587000836';
const RAZAO = 'SUPERMERCADO EXEMPLO LTDA';
const DIA = 24 * 60 * 60 * 1000;

type Ctx = ReturnType<typeof criarContexto>;

async function importar(ctx: Ctx) {
  const preview = await executarPreview(UID, { url: URL_QR }, ctx);
  expect(preview.ok).toBe(true);
  expect(await executarConfirmacao(UID, { chave: CHAVE }, ctx)).toEqual({ ok: true, chave: CHAVE });
  return preview;
}

async function estab(ctx: Ctx) {
  return (await ctx.repo.obter<Estabelecimento>(`estabelecimentos/${CNPJ}`))!;
}

async function nota(ctx: Ctx) {
  return (await ctx.repo.obter<Nota>(`usuarios/${UID}/notas/${CHAVE}`))!;
}

async function gravarEstab(ctx: Ctx, extra: Partial<Estabelecimento>) {
  await ctx.repo.gravar(`estabelecimentos/${CNPJ}`, {
    cnpj: CNPJ,
    nome: RAZAO,
    endereco: 'RUA DAS FLORES, 123, CENTRO, CURITIBA, PR',
    cidade: 'CURITIBA',
    uf: 'PR',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...extra,
  });
}

function diasAtras(ctx: Ctx, dias: number): string {
  return new Date(ctx.relogio.agora.getTime() - dias * DIA).toISOString();
}

function logsCnpj(ctx: Ctx) {
  return ctx.logs.filter((l) => l.etapa === 'cnpj');
}

describe('nome fantasia na importação', () => {
  it('loja nova: a prévia completa o nome e a confirmação reaproveita, sem consultar de novo', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    const preview = await importar(ctx);
    expect(preview.ok && preview.nota.emitente.fantasia).toBe('BOX ATACADISTA');
    expect(ctx.consultarCnpj).toHaveBeenCalledTimes(1);
    expect(ctx.consultarCnpj).toHaveBeenCalledWith(CNPJ);

    expect(await estab(ctx)).toMatchObject({
      nome: RAZAO,
      fantasia: 'BOX ATACADISTA',
      fantasiaConsultadaEm: ctx.relogio.agora.toISOString(),
    });
    const n = await nota(ctx);
    expect(n.estabelecimentoNome).toBe('BOX ATACADISTA');
    expect(JSON.stringify(n)).not.toContain('fantasiaConsultadaEm');
    expect(logsCnpj(ctx)).toEqual([
      expect.objectContaining({ resultado: 'sucesso', contagens: expect.objectContaining({ brasilapi: 1 }) }),
    ]);
  });

  it('a prévia guarda a nota já completada', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await executarPreview(UID, { url: URL_QR }, ctx);
    const doc = (await ctx.repo.obter<DocPreview>(caminhoPreview(UID, CHAVE)))!;
    expect(doc.nota.emitente.fantasia).toBe('BOX ATACADISTA');
  });

  it('cache: consultado há 10 dias não chama a Receita e usa o nome gravado', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await gravarEstab(ctx, { fantasia: 'BOX DO CACHE', fantasiaConsultadaEm: diasAtras(ctx, 10) });
    await importar(ctx);
    expect(ctx.consultarCnpj).not.toHaveBeenCalled();
    expect((await nota(ctx)).estabelecimentoNome).toBe('BOX DO CACHE');
    expect((await estab(ctx)).fantasiaConsultadaEm).toBe(diasAtras(ctx, 10));
    expect(logsCnpj(ctx)[0].contagens).toMatchObject({ cache: 1 });
  });

  it('vencido: consultado há 200 dias consulta de novo', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await gravarEstab(ctx, { fantasia: 'NOME ANTIGO', fantasiaConsultadaEm: diasAtras(ctx, 200) });
    await importar(ctx);
    expect(ctx.consultarCnpj).toHaveBeenCalledTimes(1);
    expect(await estab(ctx)).toMatchObject({
      fantasia: 'BOX ATACADISTA',
      fantasiaConsultadaEm: ctx.relogio.agora.toISOString(),
    });
  });

  it('falha: a importação segue com a razão social e não grava a data da consulta', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    ctx.consultarCnpj.mockRejectedValue(new Error('cnpj-indisponivel'));
    await importar(ctx);
    expect((await nota(ctx)).estabelecimentoNome).toBe(RAZAO);
    const e = await estab(ctx);
    expect(e.fantasia).toBeUndefined();
    expect(e.fantasiaConsultadaEm).toBeUndefined();
    expect(logsCnpj(ctx)).toEqual([
      expect.objectContaining({ etapa: 'cnpj', resultado: 'falha', erro: 'cnpj-indisponivel' }),
    ]);
  });

  it('falha com cache vencido mantém o nome antigo', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await gravarEstab(ctx, { fantasia: 'NOME ANTIGO', fantasiaConsultadaEm: diasAtras(ctx, 200) });
    ctx.consultarCnpj.mockRejectedValue(new Error('cnpj-indisponivel'));
    await importar(ctx);
    expect((await nota(ctx)).estabelecimentoNome).toBe('NOME ANTIGO');
    expect(await estab(ctx)).toMatchObject({
      fantasia: 'NOME ANTIGO',
      fantasiaConsultadaEm: diasAtras(ctx, 200),
    });
  });

  it('erro inesperado do repositório também não derruba a prévia e não vaza a mensagem', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    const obter = ctx.repo.obter.bind(ctx.repo);
    ctx.repo.obter = async <T>(c: string) => {
      if (c.startsWith('estabelecimentos/')) throw new Error(`caiu em ${c}`);
      return obter<T>(c);
    };
    expect((await executarPreview(UID, { url: URL_QR }, ctx)).ok).toBe(true);
    expect(logsCnpj(ctx)[0]).toMatchObject({ resultado: 'falha', erro: 'desconhecido' });
  });

  it('nao-encontrado grava a data da consulta sem nome fantasia', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    ctx.consultarCnpj.mockResolvedValue({ status: 'nao-encontrado', fonte: 'brasilapi' });
    await importar(ctx);
    const e = await estab(ctx);
    expect(e.fantasia).toBeUndefined();
    expect(e.fantasiaConsultadaEm).toBe(ctx.relogio.agora.toISOString());
    expect(logsCnpj(ctx)[0].contagens).toMatchObject({ naoEncontrado: 1 });
  });

  it('nome fantasia igual à razão social não é gravado', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    ctx.consultarCnpj.mockResolvedValue({
      status: 'ok',
      fonte: 'minhareceita',
      nomeFantasia: 'Supermercado Exemplo Ltda.',
    });
    await importar(ctx);
    expect((await estab(ctx)).fantasia).toBeUndefined();
    expect((await nota(ctx)).estabelecimentoNome).toBe(RAZAO);
    expect(logsCnpj(ctx)[0].contagens).toMatchObject({ minhareceita: 1, semFantasia: 1 });
  });

  it('fila (reprocessarPendentes) também completa o nome fantasia', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await executarEnfileirar(UID, { url: URL_QR }, ctx);
    ctx.relogio.agora = new Date(ctx.relogio.agora.getTime() + DIA);
    expect(await executarReprocessamento(ctx)).toMatchObject({ importadas: 1 });
    expect((await nota(ctx)).estabelecimentoNome).toBe('BOX ATACADISTA');
    expect((await estab(ctx)).fantasia).toBe('BOX ATACADISTA');
  });

  it('o log da etapa cnpj não leva CNPJ, nome nem chave', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await importar(ctx);
    const texto = JSON.stringify(logsCnpj(ctx));
    expect(logsCnpj(ctx).length).toBeGreaterThan(0);
    expect(texto).not.toContain(CNPJ);
    expect(texto).not.toContain('BOX');
    expect(texto).not.toContain(CHAVE);
    expect(texto).not.toContain('SUPERMERCADO');
  });
});
