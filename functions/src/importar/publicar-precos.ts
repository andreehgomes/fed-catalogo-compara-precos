import { etiquetar } from '@shared/etiquetas';
import { produtoIdDe, normalizarGtin } from '@shared/gtin';
import type { Etiquetas } from '@shared/etiquetas';
import type { NfceParsed, Nota, Observacao, Preco, Produto, ProdutoId } from '@shared/model';
import { normalizarDescricao, tokens } from '@shared/normalizar';
import { extrairConteudo, precoPorUnidadeBase } from '@shared/unidade';
import type { Operacao, Repositorio } from '../dados/repositorio';

export const VALIDADE_MENOR_PRECO_MS = 90 * 24 * 60 * 60 * 1000;
export const LIMITE_CNPJS = 50;

/** Nota do usuário (modelo 5.3), com `produtoId` e preço por unidade base por item. */
export function montarNota(
  nota: NfceParsed,
  importadaEm: Date,
  veioDaFila: boolean,
  nome = nota.emitente.fantasia || nota.emitente.nome,
): Nota {
  return {
    chave: nota.chave,
    cnpj: nota.emitente.cnpj,
    estabelecimentoNome: nome,
    estabelecimentoCidade: nota.emitente.cidade,
    emissao: nota.emissao,
    total: nota.total,
    desconto: nota.desconto,
    qtdItens: nota.itens.length,
    itens: nota.itens.map(({ etiquetas: _e, ...i }) => ({
      ...i,
      ean: normalizarGtin(i.ean),
      produtoId: produtoIdDe(i.ean, nota.emitente.cnpj, i.codigo),
      precoPorUnidadeBase: precoPorUnidadeBase(i.vlUnit, i.unidade, extrairConteudo(i.descricao)),
    })),
    importadaEm: importadaEm.toISOString(),
    ...(veioDaFila ? { veioDaFila: true, aberta: false } : {}),
  };
}

function atualizarMenor(atual: Observacao | null, nova: Observacao): Observacao {
  if (!atual) return nova;
  const vencido =
    new Date(nova.emissao).getTime() - new Date(atual.emissao).getTime() > VALIDADE_MENOR_PRECO_MS;
  return vencido || nova.vlUnit < atual.vlUnit ? nova : atual;
}

function atualizarUltima(atual: Observacao | null, nova: Observacao): Observacao {
  return !atual || nova.emissao >= atual.emissao ? nova : atual;
}

/** Etiquetas que a IA deu na prévia, por produto (a nota gravada não as leva). */
export function etiquetasDaNota(nota: NfceParsed): Map<ProdutoId, Etiquetas> {
  const mapa = new Map<ProdutoId, Etiquetas>();
  for (const i of nota.itens)
    if (i.etiquetas) mapa.set(produtoIdDe(i.ean, nota.emitente.cnpj, i.codigo), i.etiquetas);
  return mapa;
}

/** `manual` fica; o resto é da IA (o nome veio da prévia ou já estava no produto). */
function nomeDoProduto(
  atual: Produto | null,
  nomeItem: string | undefined,
): Pick<Produto, 'nome' | 'nomeOrigem'> {
  if (atual?.nomeOrigem === 'manual') return { nome: atual.nome, nomeOrigem: 'manual' };
  const nome = nomeItem ?? atual?.nome;
  return nome ? { nome, nomeOrigem: 'ia' } : {};
}

/**
 * Publica os preços anônimos da nota: upsert de `produtos/{id}` e `precos/{chave}_{n}`.
 * Nenhum documento leva uid ou referência ao usuário (RNF-24). Ids determinísticos: rodar
 * de novo não duplica. Devolve os produtos criados agora.
 */
export async function publicarPrecos(
  repo: Repositorio,
  nota: Nota,
  etiquetasIa: ReadonlyMap<ProdutoId, Etiquetas> = new Map(),
): Promise<ProdutoId[]> {
  const ids = [...new Set(nota.itens.map((i) => i.produtoId))];
  const existentes = await repo.obterVarios<Produto>(ids.map((id) => `produtos/${id}`));
  const existentesPorId = new Map(ids.map((id, k) => [id, existentes[k]]));
  const produtos = new Map<ProdutoId, Produto | null>(existentesPorId);
  const operacoes: Operacao[] = [];

  for (const item of nota.itens) {
    const obs: Observacao = { cnpj: nota.cnpj, vlUnit: item.vlUnit, emissao: nota.emissao };
    const atual = produtos.get(item.produtoId) ?? null;
    const conteudo = extrairConteudo(item.descricao);
    const etiquetas =
      etiquetasIa.get(item.produtoId) ??
      (atual?.etiquetas?.origem === 'ia' ? atual.etiquetas : etiquetar(item.descricao));
    const produto: Produto = {
      ...atual,
      id: item.produtoId,
      ean: item.ean,
      descricao: item.descricao,
      descricaoNorm: normalizarDescricao(item.descricao),
      tokens: tokens(item.descricao),
      conteudo: conteudo ?? atual?.conteudo ?? null,
      vinculadoA: atual?.vinculadoA ?? null,
      menorPreco: atualizarMenor(atual?.menorPreco ?? null, obs),
      ultimaObservacao: atualizarUltima(atual?.ultimaObservacao ?? null, obs),
      cnpjs: [...new Set([...(atual?.cnpjs ?? []), nota.cnpj])].slice(-LIMITE_CNPJS),
      etiquetas,
      bloco: etiquetas.bloco,
      ...nomeDoProduto(atual, item.nome),
    };
    produtos.set(item.produtoId, produto);
    const preco: Preco = {
      produtoId: item.produtoId,
      cnpj: nota.cnpj,
      vlUnit: item.vlUnit,
      unidade: item.unidade,
      precoPorUnidadeBase: item.precoPorUnidadeBase,
      emissao: nota.emissao,
    };
    operacoes.push({
      tipo: 'gravar',
      caminho: `precos/${nota.chave}_${item.n}`,
      dados: { ...preco },
    });
  }
  for (const [id, p] of produtos) {
    if (!p) continue;
    operacoes.push({ tipo: 'gravar', caminho: `produtos/${id}`, dados: { ...p } });
  }
  await repo.lote(operacoes);
  return ids.filter((id) => !existentesPorId.get(id));
}
