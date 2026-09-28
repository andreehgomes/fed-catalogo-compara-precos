import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Estabelecimento, Produto, ProdutoId, VinculoAuto } from '@shared/model';
import { buscarMenorPreco } from '../src/menor-preco/cliente';
import {
  lerOfertas,
  MenorPrecoBloqueadoError,
  MenorPrecoIndisponivelError,
} from '../src/menor-preco/oferta';
import {
  CONSULTAS_POR_EXECUCAO,
  ESPERAS_SEM_RESULTADO_MS,
  INTERVALO_ENTRE_CONSULTAS_MS,
  executarVinculoAuto,
  localDoMunicipio,
} from '../src/produtos/vincular-auto';
import { criarContexto, type ContextoTeste } from './apoio';

const mp = (nome: string): unknown =>
  JSON.parse(readFileSync(resolve(__dirname, 'fixtures/menor-preco', `${nome}.json`), 'utf8'));

const CNPJ = '03644587000836';
const AGORA = new Date('2026-09-28T18:00:00.000Z');

function produto(codigo: string, descricao: string, extra: Partial<Produto> = {}): Produto {
  return {
    id: `loc:${CNPJ}:${codigo}`,
    ean: null,
    descricao,
    descricaoNorm: descricao.toUpperCase(),
    tokens: [],
    conteudo: null,
    vinculadoA: null,
    menorPreco: { cnpj: CNPJ, vlUnit: 2.39, emissao: '2026-09-26T20:34:20.000Z' },
    ultimaObservacao: { cnpj: CNPJ, vlUnit: 2.39, emissao: '2026-09-26T20:34:20.000Z' },
    cnpjs: [CNPJ],
    ...extra,
  };
}

async function montar(
  produtos: Produto[],
  respostas: Record<string, unknown> = {},
): Promise<ContextoTeste> {
  const ctx = criarContexto({ agora: AGORA });
  const estab: Estabelecimento = {
    cnpj: CNPJ,
    nome: 'Sanches e Vecchiate Ltda',
    endereco: 'Rua Das Acacias,248, 0, , Vila Claro, St Anton Da Platina, PR',
    cidade: 'St Anton Da Platina',
    uf: 'PR',
    atualizadoEm: AGORA.toISOString(),
  };
  await ctx.repo.gravar(`estabelecimentos/${CNPJ}`, { ...estab });
  for (const [i, p] of produtos.entries()) {
    await ctx.repo.gravar(`produtos/${p.id}`, { ...p });
    const v: VinculoAuto = {
      produtoId: p.id,
      cnpj: CNPJ,
      vlUnit: 2.39,
      status: 'aguardando',
      tentativas: 0,
      proximaTentativa: new Date(AGORA.getTime() - (produtos.length - i) * 1000).toISOString(),
      criadoEm: AGORA.toISOString(),
    };
    await ctx.repo.gravar(`vinculosAuto/${p.id}`, { ...v });
  }
  await ctx.repo.gravar('controle/vinculoAuto', { backfillConcluido: true });
  ctx.buscarMenorPreco.mockImplementation(async (q) => respostas[q.termo] ?? { produtos: [] });
  return ctx;
}

const obter = <T>(ctx: ContextoTeste, caminho: string) => ctx.repo.obter<T>(caminho);

describe('lerOfertas', () => {
  it('lê a resposta real e descarta item inválido', () => {
    const ofertas = lerOfertas(mp('detergente-ype-coco'));
    expect(ofertas).toHaveLength(8);
    expect(ofertas[0]).toMatchObject({
      gtin: '7896098900239',
      estabelecimento: { municipio: 'SANTO ANTONIO DA PLATINA' },
    });
    expect(lerOfertas({ produtos: [{ desc: '' }] })).toEqual([]);
  });

  it.each(['envenenada-leite-lider', 'envenenada-milho-predilecta'])('%s → bloqueio', (nome) => {
    expect(() => lerOfertas(mp(nome))).toThrow(MenorPrecoBloqueadoError);
  });

  it('sem lista de produtos → indisponível', () => {
    expect(() => lerOfertas({ erro: 1 })).toThrow(MenorPrecoIndisponivelError);
  });
});

describe('buscarMenorPreco', () => {
  it('monta a URL fixa e converte HTTP 500 e falha de rede', async () => {
    let url = '';
    const ok = async (u: string | URL | Request) => {
      url = String(u);
      return new Response('{"produtos":[]}');
    };
    await buscarMenorPreco(
      { termo: 'cafe itamaraty', local: '6gu7kr1', raioKm: 10 },
      ok as typeof fetch,
    );
    expect(url).toBe(
      'https://menorpreco.notaparana.pr.gov.br/api/v1/produtos?local=6gu7kr1&termo=cafe+itamaraty&raio=10&data=-1&offset=0',
    );
    const erro500 = (async () => new Response('x', { status: 500 })) as typeof fetch;
    await expect(buscarMenorPreco({ termo: 'a', local: 'b', raioKm: 1 }, erro500)).rejects.toThrow(
      MenorPrecoIndisponivelError,
    );
    const semRede = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(buscarMenorPreco({ termo: 'a', local: 'b', raioKm: 1 }, semRede)).rejects.toThrow(
      MenorPrecoIndisponivelError,
    );
  });
});

describe('localDoMunicipio', () => {
  it('acha a cidade abreviada da NFC-e', () => {
    expect(localDoMunicipio('St Anton Da Platina')).toBe('6gu7kr1');
    expect(localDoMunicipio('Cidade Inexistente')).toBeNull();
  });
});

describe('vincularProdutosAuto', () => {
  it('detergente: GTIN único em várias lojas → cria o ean: e vincula', async () => {
    const det = produto('219177', 'Det Ype 500ml Coco');
    const ctx = await montar([det], { 'detergente ype coco': mp('detergente-ype-coco') });
    const resumo = await executarVinculoAuto(ctx);
    expect(resumo).toMatchObject({ vinculado: 1, consultas: 1, parada: 'fim' });
    expect(ctx.buscarMenorPreco).toHaveBeenCalledWith({
      termo: 'detergente ype coco',
      local: '6gu7kr1',
      raioKm: 10,
    });
    expect(await obter<Produto>(ctx, `produtos/${det.id}`)).toMatchObject({
      vinculadoA: 'ean:7896098900239',
      vinculoOrigem: 'auto',
    });
    expect(await obter<Produto>(ctx, 'produtos/ean:7896098900239')).toMatchObject({
      ean: '7896098900239',
      vinculadoA: null,
      menorPreco: { vlUnit: 2.39 },
      cnpjs: [CNPJ],
    });
    expect(await obter<VinculoAuto>(ctx, `vinculosAuto/${det.id}`)).toMatchObject({
      status: 'concluido',
      resultado: 'vinculado',
    });
  });

  it('café: GTINs concorrentes → não vincula e grava até 3 sugestões', async () => {
    const cafe = produto('912042', 'Cafe Itamaraty 500g');
    const ctx = await montar([cafe], { 'cafe itamaraty': mp('cafe-itamaraty') });
    expect(await executarVinculoAuto(ctx)).toMatchObject({ ambiguo: 1 });
    const p = (await obter<Produto>(ctx, `produtos/${cafe.id}`))!;
    expect(p.vinculadoA).toBeNull();
    expect(p.sugestoesEan!.map((s) => s.gtin)).toEqual([
      '7896045102495',
      '7896045102501',
      '7896005806012',
    ]);
    expect(await obter(ctx, 'produtos/ean:7896045102495')).toBeNull();
  });

  it('sem ofertas: tenta o termo alternativo e reagenda em 1, 7 e 30 dias', async () => {
    const des = produto('782220', 'Des Rexona 50ml Form');
    const ctx = await montar([des]);
    await executarVinculoAuto(ctx);
    expect(ctx.buscarMenorPreco.mock.calls.map(([q]) => q.termo)).toEqual([
      'des rexona form',
      'rexona form',
    ]);
    for (const [i, espera] of ESPERAS_SEM_RESULTADO_MS.entries()) {
      const v = (await obter<VinculoAuto>(ctx, `vinculosAuto/${des.id}`))!;
      expect(v).toMatchObject({
        status: 'aguardando',
        tentativas: i + 1,
        resultado: 'sem-resultado',
      });
      expect(v.proximaTentativa).toBe(new Date(ctx.relogio.agora.getTime() + espera).toISOString());
      ctx.relogio.agora = new Date(v.proximaTentativa);
      await executarVinculoAuto(ctx);
    }
    expect(await obter<VinculoAuto>(ctx, `vinculosAuto/${des.id}`)).toMatchObject({
      status: 'concluido',
    });
  });

  it('resposta envenenada: não vincula nada e pausa a fila por 2 h', async () => {
    const leite = produto('1324276', 'Leite Lider 1l Desn');
    const ctx = await montar([leite], { 'leite lider desnatado': mp('envenenada-leite-lider') });
    expect(await executarVinculoAuto(ctx)).toMatchObject({ parada: 'bloqueio', vinculado: 0 });
    expect(await obter(ctx, 'controle/vinculoAuto')).toMatchObject({
      pausadoAte: '2026-09-28T20:00:00.000Z',
    });
    expect(await obter<VinculoAuto>(ctx, `vinculosAuto/${leite.id}`)).toMatchObject({
      tentativas: 0,
    });
    ctx.buscarMenorPreco.mockClear();
    expect(await executarVinculoAuto(ctx)).toMatchObject({ parada: 'pausado' });
    expect(ctx.buscarMenorPreco).not.toHaveBeenCalled();
  });

  it('Menor Preço fora: não gasta tentativa e reagenda em 1 h', async () => {
    const det = produto('219177', 'Det Ype 500ml Coco');
    const ctx = await montar([det]);
    ctx.buscarMenorPreco.mockRejectedValue(new MenorPrecoIndisponivelError('HTTP 503'));
    expect(await executarVinculoAuto(ctx)).toMatchObject({ parada: 'fonte-fora' });
    expect(await obter<VinculoAuto>(ctx, `vinculosAuto/${det.id}`)).toMatchObject({
      tentativas: 0,
      proximaTentativa: '2026-09-28T19:00:00.000Z',
    });
  });

  it('respeita o limite de consultas e o intervalo entre elas', async () => {
    const muitos = Array.from({ length: CONSULTAS_POR_EXECUCAO + 3 }, (_, i) =>
      produto(`X${i}`, 'Cafe Marca Especial Forte'),
    );
    const ctx = await montar(muitos);
    const esperas: number[] = [];
    ctx.esperar = async (ms) => void esperas.push(ms);
    expect(await executarVinculoAuto(ctx)).toMatchObject({
      consultas: CONSULTAS_POR_EXECUCAO,
      parada: 'limite',
    });
    expect(esperas).toEqual(Array(CONSULTAS_POR_EXECUCAO - 1).fill(INTERVALO_ENTRE_CONSULTAS_MS));
  });

  it('não mexe em produto já vinculado ou desvinculado à mão', async () => {
    const a = produto('1', 'Det Ype 500ml Coco', { vinculoBloqueado: true });
    const b = produto('2', 'Det Ype 500ml Coco', { vinculadoA: 'ean:7896098900239' as ProdutoId });
    const ctx = await montar([a, b], { 'detergente ype coco': mp('detergente-ype-coco') });
    expect(await executarVinculoAuto(ctx)).toMatchObject({ ignorado: 2, consultas: 0 });
  });

  it('backfill: produtos loc: antigos entram na fila aos poucos', async () => {
    const ctx = await montar([]);
    await ctx.repo.apagar('controle/vinculoAuto');
    await ctx.repo.gravar(`produtos/${produto('A', 'Det Ype 500ml Coco').id}`, {
      ...produto('A', 'Det Ype 500ml Coco'),
    });
    await ctx.repo.gravar('produtos/ean:7896098900239', {
      ...produto('E', 'x'),
      id: 'ean:7896098900239',
    });
    expect(await executarVinculoAuto(ctx)).toMatchObject({ enfileiradosBackfill: 1 });
    expect(await obter<VinculoAuto>(ctx, `vinculosAuto/loc:${CNPJ}:A`)).toMatchObject({
      status: 'aguardando',
      cnpj: CNPJ,
    });
    await executarVinculoAuto(ctx);
    expect(await obter(ctx, 'controle/vinculoAuto')).toMatchObject({ backfillConcluido: true });
  });
});
