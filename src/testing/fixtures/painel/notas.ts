import type { ItemNota, Nota, Produto, ProdutoId } from '@shared/model';
import { extrairConteudo, precoPorUnidadeBase } from '@shared/unidade';
import { montarGrupos } from '../../../app/features/notas/detalhe/historico-pessoal';
import {
  ALFA,
  ARROZ_ALFA,
  ARROZ_BETA,
  BETA,
  CAFE,
  DETERGENTE_1L,
  LEITE,
  PILHA,
  PRODUTOS_SUGESTAO,
} from '../sugestao/produtos';

/**
 * Histórico curto, como o do dv (compra mensal): 28/08 no Alfa, 28/09 no Beta e 03/10 no Alfa.
 * Contra o melhor preço dos 60 dias anteriores:
 * - 28/09: leite R$ 1,00 a mais (2 × 0,50); café (2,40) e arroz vinculado (2,00) de economia;
 * - 03/10: leite R$ 0,60 a mais (2 × 0,30) e café R$ 2,40 a mais; detergente é primeira compra.
 * A pilha só aparece em 28/08. O leite subiu de 4,99 para 5,29 (+6 %) entre a primeira e a última.
 */
export const HOJE_PAINEL = new Date('2026-10-25T15:00:00.000Z');

interface Compra {
  produtoId: ProdutoId;
  descricao: string;
  qtd: number;
  vlUnit: number;
  nome?: string;
}

function item(c: Compra, n: number): ItemNota {
  return {
    n,
    descricao: c.descricao,
    codigo: c.produtoId.split(':').at(-1)!,
    ean: c.produtoId.startsWith('ean:') ? c.produtoId.slice(4) : null,
    qtd: c.qtd,
    unidade: 'UN',
    vlUnit: c.vlUnit,
    vlTotal: Math.round(c.qtd * c.vlUnit * 100) / 100,
    produtoId: c.produtoId,
    precoPorUnidadeBase: precoPorUnidadeBase(c.vlUnit, 'UN', extrairConteudo(c.descricao)),
    ...(c.nome ? { nome: c.nome } : {}),
  };
}

export function notaPainel(
  chave: string,
  mercado: { cnpj: string; nome: string },
  emissao: string,
  compras: readonly Compra[],
): Nota {
  const itens = compras.map((c, i) => item(c, i + 1));
  return {
    chave,
    cnpj: mercado.cnpj,
    estabelecimentoNome: mercado.nome,
    estabelecimentoCidade: 'CURITIBA',
    emissao,
    total: Math.round(itens.reduce((s, i) => s + i.vlTotal, 0) * 100) / 100,
    desconto: 0,
    qtdItens: itens.length,
    itens,
    importadaEm: emissao,
  };
}

const LEITE_1L = { produtoId: LEITE, descricao: 'LEITE INTEGRAL 1L', nome: 'Leite Integral 1 L' };
const CAFE_500 = { produtoId: CAFE, descricao: 'CAFE TORRADO 500G' };

export const AGOSTO = notaPainel('agosto', ALFA, '2026-08-28T15:00:00.000Z', [
  { ...LEITE_1L, qtd: 2, vlUnit: 4.99 },
  { ...CAFE_500, qtd: 1, vlUnit: 18.9 },
  { produtoId: ARROZ_ALFA, descricao: 'ARROZ T1 5KG', qtd: 1, vlUnit: 24.9 },
  { produtoId: PILHA, descricao: 'PILHA AA C/4', qtd: 1, vlUnit: 19.9 },
]);

export const SETEMBRO = notaPainel('setembro', BETA, '2026-09-28T15:00:00.000Z', [
  { ...LEITE_1L, qtd: 2, vlUnit: 5.49 },
  { ...CAFE_500, qtd: 1, vlUnit: 16.5 },
  { produtoId: ARROZ_BETA, descricao: 'ARROZ TIPO1 PCT 5KG', qtd: 1, vlUnit: 22.9 },
]);

export const OUTUBRO = notaPainel('outubro', ALFA, '2026-10-03T15:00:00.000Z', [
  { ...LEITE_1L, qtd: 2, vlUnit: 5.29 },
  { ...CAFE_500, qtd: 1, vlUnit: 18.9 },
  { produtoId: DETERGENTE_1L, descricao: 'DETERGENTE LIQUIDO 1L', qtd: 1, vlUnit: 5.99 },
]);

/** Da mais recente para a mais antiga (como o `NotasService`). */
export const NOTAS_PAINEL: Nota[] = [OUTUBRO, SETEMBRO, AGOSTO];

export const GRUPOS_PAINEL = montarGrupos(
  new Map<string, Produto>(PRODUTOS_SUGESTAO.map((p) => [p.id, p])),
  [],
);
