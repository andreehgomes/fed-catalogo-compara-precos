import { APIError } from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { etiquetasDaIa, type NomeIa } from '@shared/nome-produto';
import type { NfceParsed, Nota, Produto } from '@shared/model';
import { urlPermitida } from '../src/importar/allowlist';
import { executarConfirmacao } from '../src/importar/confirmar-nfce';
import { gravarNota } from '../src/importar/gravar-nota';
import { obterNotaDaSefaz } from '../src/importar/obter-nota';
import { caminhoPreview, executarPreview, type DocPreview } from '../src/importar/preview-nfce';
import type { ItemNome } from '../src/nome/ia-nome';
import { nomearItens } from '../src/nome/nomear-itens';
import { caminhoGastoIa } from '../src/vinculo/vincular-nota';
import { CHAVE, PAGINA_NOTA_OK, URL_QR, criarContexto, notaExemplo } from './apoio';

const UID = 'usuarioA';
const GASTO = caminhoGastoIa(new Date('2026-09-27T15:00:00.000Z'));

const NOMES: Record<string, NomeIa> = {
  'LEITE UHT INT 1L': {
    nome: 'Leite UHT Integral 1 L',
    tipo: 'leite',
    marca: null,
    variantes: ['integral'],
    tamanho: { quantidade: 1, unidade: 'L' },
    granel: false,
  },
  'BANANA NANICA KG': {
    nome: 'Banana Nanica',
    tipo: 'banana',
    marca: null,
    variantes: ['nanica'],
    tamanho: null,
    granel: true,
  },
  'CAFE PILAO 500G': {
    nome: 'Café Pilão 500 g',
    tipo: 'café',
    marca: 'Pilão',
    variantes: [],
    tamanho: { quantidade: 500, unidade: 'g' },
    granel: false,
  },
};

/** Fake da IA: responde pelo dicionário, com custo fixo por chamada. */
function comIa(ctx: ReturnType<typeof criarContexto>, nomes = NOMES) {
  ctx.normalizarNomes.mockImplementation(async (itens: ItemNome[]) => ({
    nomes: new Map(itens.filter((it) => nomes[it.d]).map((it) => [it.i, nomes[it.d]])),
    custoUsd: 0.01,
    chamadas: 1,
  }));
  return ctx;
}

const logNome = (ctx: ReturnType<typeof criarContexto>) => ctx.logs.find((l) => l.etapa === 'nome');

describe('nome legível na prévia (nomearItens)', () => {
  it('a IA recebe só número e descrição; a prévia mostra o nome e guarda as etiquetas', async () => {
    const ctx = comIa(criarContexto({ resposta: PAGINA_NOTA_OK }));
    const r = await executarPreview(UID, { url: URL_QR }, ctx);

    expect(ctx.normalizarNomes).toHaveBeenCalledOnce();
    expect(ctx.normalizarNomes.mock.calls[0][0]).toEqual([
      { i: 1, d: 'LEITE UHT INT 1L' },
      { i: 2, d: 'BANANA NANICA KG' },
      { i: 3, d: 'CAFE PILAO 500G' },
    ]);
    expect(r.ok && r.nota.itens.map((i) => i.nome)).toEqual([
      'Leite UHT Integral 1 L',
      'Banana Nanica',
      'Café Pilão 500 g',
    ]);
    expect(r.ok && r.nota.itens.some((i) => 'etiquetas' in i)).toBe(false);
    const doc = (await ctx.repo.obter<DocPreview>(caminhoPreview(UID, CHAVE)))!;
    expect(doc.nota.itens[1].etiquetas).toMatchObject({ bloco: 'GRANEL|BANANA', origem: 'ia' });
    expect(await ctx.repo.obter(GASTO)).toEqual({
      custoUsd: 0.01,
      chamadas: 1,
      porEtapa: { nome: { custoUsd: 0.01, chamadas: 1 } },
    });
    expect(logNome(ctx)).toMatchObject({
      resultado: 'sucesso',
      contagens: { itens: 3, daBase: 0, ia: 3, semNome: 0, chamadas: 1 },
    });
    const { chave: _chave, ...semChave } = logNome(ctx)!;
    expect(JSON.stringify(semChave)).not.toMatch(/LEITE|Leite|03644587000836/);
  });

  it('produto já nomeado empresta o nome sem ir para a IA; repetido na nota vai uma vez só', async () => {
    const ctx = comIa(criarContexto());
    await ctx.repo.gravar('produtos/ean:7891000100103', {
      id: 'ean:7891000100103',
      nome: 'Leite Integral (corrigido)',
      nomeOrigem: 'manual',
    });
    const nota = notaExemplo(CHAVE, 3);
    nota.itens.push({ ...nota.itens[2], n: 4 });
    const nomeada = await nomearItens(ctx, nota);

    expect(ctx.normalizarNomes.mock.calls[0][0].map((it) => it.d)).toEqual([
      'BANANA NANICA KG',
      'CAFE PILAO 500G',
    ]);
    expect(nomeada.itens.map((i) => i.nome)).toEqual([
      'Leite Integral (corrigido)',
      'Banana Nanica',
      'Café Pilão 500 g',
      'Café Pilão 500 g',
    ]);
    expect(nomeada.itens[0].etiquetas).toBeUndefined();
    expect(logNome(ctx)?.contagens).toMatchObject({ daBase: 1, ia: 3 });
  });

  it('tudo já nomeado não chama a IA', async () => {
    const ctx = comIa(criarContexto());
    const nota = notaExemplo(CHAVE, 1);
    await ctx.repo.gravar('produtos/ean:7891000100103', { nome: 'Leite UHT Integral 1 L' });
    await nomearItens(ctx, nota);
    expect(ctx.normalizarNomes).not.toHaveBeenCalled();
    expect(await ctx.repo.obter(GASTO)).toBeNull();
  });

  it('IA fora: itens sem nome, log com o motivo, a nota segue igual', async () => {
    const ctx = criarContexto();
    ctx.normalizarNomes.mockRejectedValue(
      APIError.generate(
        401,
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        undefined,
        new Headers(),
      ),
    );
    const nota = notaExemplo();
    const nomeada = await nomearItens(ctx, nota);

    expect(nomeada).toEqual(nota);
    expect(logNome(ctx)).toMatchObject({
      resultado: 'falha',
      erro: 'ia-401',
      tipoErro: 'authentication_error',
      contagens: { semNome: 3 },
    });
    expect(JSON.stringify(logNome(ctx))).not.toContain('x-api-key');
  });

  it('resposta parcial aplica o que veio e loga a falha da outra parte', async () => {
    const ctx = criarContexto();
    ctx.normalizarNomes.mockResolvedValue({
      nomes: new Map([[1, NOMES['LEITE UHT INT 1L']]]),
      custoUsd: 0.01,
      chamadas: 2,
      erro: new Error('qualquer'),
    });
    const nomeada = await nomearItens(ctx, notaExemplo());
    expect(nomeada.itens.map((i) => i.nome ?? null)).toEqual([
      'Leite UHT Integral 1 L',
      null,
      null,
    ]);
    expect(logNome(ctx)).toMatchObject({ resultado: 'falha', erro: 'ia-erro' });
  });

  it('repositório fora também não derruba: sem nome e erro próprio', async () => {
    const ctx = comIa(criarContexto());
    ctx.repo.obterVarios = async () => {
      throw new Error('firestore');
    };
    const nota = notaExemplo();
    expect(await nomearItens(ctx, nota)).toEqual(nota);
    expect(logNome(ctx)).toMatchObject({ resultado: 'falha', erro: 'nome-erro' });
  });

  it('na reimportação (nomear: false) a IA não é chamada', async () => {
    const ctx = comIa(criarContexto({ resposta: PAGINA_NOTA_OK }));
    await obterNotaDaSefaz(ctx, urlPermitida(URL_QR)!, { nomear: false });
    expect(ctx.normalizarNomes).not.toHaveBeenCalled();
  });
});

describe('gravação com nome e etiquetas da IA', () => {
  it('confirmar grava nome no item e no produto, etiquetas da IA, e a nota não leva etiquetas', async () => {
    const ctx = comIa(criarContexto({ resposta: PAGINA_NOTA_OK }));
    await executarPreview(UID, { url: URL_QR }, ctx);
    await executarConfirmacao(UID, { chave: CHAVE }, ctx);

    const nota = (await ctx.repo.obter<Nota>(`usuarios/${UID}/notas/${CHAVE}`))!;
    expect(nota.itens.map((i) => i.nome)).toEqual([
      'Leite UHT Integral 1 L',
      'Banana Nanica',
      'Café Pilão 500 g',
    ]);
    expect(nota.itens.some((i) => 'etiquetas' in i)).toBe(false);
    expect(await ctx.repo.obter<Produto>('produtos/ean:7896089011203')).toMatchObject({
      nome: 'Café Pilão 500 g',
      nomeOrigem: 'ia',
      etiquetas: { marca: 'PILAO', tamanho: '0.5kg', origem: 'ia' },
      bloco: 'PILAO|0.5kg',
    });
  });

  it('sem IA grava como antes: sem nome e etiquetas da regra', async () => {
    const ctx = criarContexto({ resposta: PAGINA_NOTA_OK });
    await executarPreview(UID, { url: URL_QR }, ctx);
    await executarConfirmacao(UID, { chave: CHAVE }, ctx);
    const cafe = (await ctx.repo.obter<Produto>('produtos/ean:7896089011203'))!;
    expect(cafe.nome).toBeUndefined();
    expect(cafe.etiquetas?.origem).toBeUndefined();
  });

  it('nota nova sem IA não troca as etiquetas da IA pela regra nem o nome manual', async () => {
    const ctx = criarContexto();
    const etiquetas = etiquetasDaIa(NOMES['CAFE PILAO 500G'], 'CAFE PILAO 500G');
    await ctx.repo.gravar('produtos/ean:7896089011203', {
      id: 'ean:7896089011203',
      descricao: 'CAFE PILAO 500G',
      nome: 'Café do usuário',
      nomeOrigem: 'manual',
      etiquetas,
      bloco: etiquetas.bloco,
    });
    const outra: NfceParsed = {
      ...notaExemplo('41260903644587000836652100000168701620438548'),
      itens: [],
    };
    outra.itens = [{ ...notaExemplo().itens[2], nome: 'Café Pilão 500 g' }];
    await gravarNota(ctx, 'u', outra, { veioDaFila: false });

    expect(await ctx.repo.obter<Produto>('produtos/ean:7896089011203')).toMatchObject({
      nome: 'Café do usuário',
      nomeOrigem: 'manual',
      etiquetas: { origem: 'ia' },
    });
  });

  it('cebola a granel de dois mercados liga pela regra', async () => {
    const OUTRA = '11111111000111';
    const cebola: NomeIa = {
      nome: 'Cebola',
      tipo: 'cebola',
      marca: null,
      variantes: [],
      tamanho: null,
      granel: true,
    };
    const etiquetas = etiquetasDaIa(cebola, 'Cebola Kg');
    const id = `loc:${OUTRA}:C1`;
    const ctx = comIa(criarContexto(), { 'FEIRA CEBOLA KG': cebola });
    await ctx.repo.gravar(`produtos/${id}`, {
      id,
      ean: null,
      descricao: 'Cebola Kg',
      vinculadoA: null,
      cnpjs: [OUTRA],
      etiquetas,
      bloco: etiquetas.bloco,
    });
    const nota = notaExemplo(CHAVE, 1);
    nota.itens = [{ ...nota.itens[0], descricao: 'FEIRA CEBOLA KG', ean: null, codigo: 'F1' }];
    await gravarNota(ctx, 'u', await nomearItens(ctx, nota), { veioDaFila: false });

    expect(await ctx.repo.obter('produtos/loc:03644587000836:F1')).toMatchObject({
      bloco: 'GRANEL|CEBOLA',
      vinculadoA: id,
      vinculoMotivo: 'etiquetas',
    });
    expect(ctx.classificarVinculos).not.toHaveBeenCalled();
  });
});
