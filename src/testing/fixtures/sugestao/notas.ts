import type { ItemNota, Nota, ProdutoId } from '@shared/model';
import { extrairConteudo, precoPorUnidadeBase } from '@shared/unidade';
import {
  ACHOCOLATADO,
  ALFA,
  ARROZ_ALFA,
  ARROZ_BETA,
  AZEITE,
  BANANA,
  BETA,
  CAFE,
  DETERGENTE_1L,
  DETERGENTE_500,
  GAMA,
  LEITE,
  PILHA,
} from './produtos';

/**
 * Notas sintéticas de 12 meses até `HOJE_SUGESTAO` (gerador determinístico, sem dado real).
 * Na data fixa e com horizonte "semana":
 * - Hora de repor: leite (semanal, 9 dias), arroz (21 dias, `loc:` de Alfa e Beta vinculados,
 *   25 dias) e banana (granel, 10 dias, exatamente um ciclo);
 * - Em breve: café (quinzenal, 12 dias, alterna Alfa/Beta) e azeite (2 ocasiões → baixa);
 * - detergente (mensal, 1 L × 2 de 500 mL, 20 dias) só entra com "próximos 15 dias";
 * - Parou de comprar?: achocolatado (a cada 14 dias, última há 60);
 * - fora: pilha (ciclo de 150 dias).
 * O leite de 16 dias atrás no Alfa e o de 15 no Beta formam uma ocasião só.
 */
export const HOJE_SUGESTAO = new Date('2026-09-29T15:00:00.000Z');

interface Mercado {
  cnpj: string;
  nome: string;
}

interface Compra {
  mercado: Mercado;
  dias: number;
  produtoId: ProdutoId;
  descricao: string;
  qtd: number;
  unidade: string;
  vlUnit: number;
}

function vezes(n: number, f: (k: number) => Compra): Compra[] {
  return Array.from({ length: n }, (_, k) => f(k));
}

const COMPRAS: Compra[] = [
  ...vezes(50, (k) => ({
    mercado: ALFA,
    dias: 9 + 7 * k,
    produtoId: LEITE,
    descricao: 'LEITE INTEGRAL 1L',
    qtd: 2,
    unidade: 'UN',
    vlUnit: 4.99,
  })),
  {
    mercado: BETA,
    dias: 15,
    produtoId: LEITE,
    descricao: 'LEITE INTEGRAL 1L',
    qtd: 1,
    unidade: 'UN',
    vlUnit: 5.29,
  },
  ...vezes(25, (k) => ({
    mercado: k % 2 ? BETA : ALFA,
    dias: 12 + 14 * k,
    produtoId: CAFE,
    descricao: 'CAFE TORRADO 500G',
    qtd: 1,
    unidade: 'UN',
    vlUnit: k === 5 ? 15.9 : k % 2 ? 16.5 : 18.9,
  })),
  ...vezes(35, (k) => ({
    mercado: GAMA,
    dias: 10 + 10 * k,
    produtoId: BANANA,
    descricao: 'BANANA PRATA KG',
    qtd: [1.245, 1.1, 1.4, 1.3][k % 4],
    unidade: 'KG',
    vlUnit: k % 3 === 1 ? 4.99 : 5.49,
  })),
  ...vezes(12, (k) =>
    k % 2
      ? {
          mercado: BETA,
          dias: 20 + 30 * k,
          produtoId: DETERGENTE_500,
          descricao: 'DETERGENTE LIQUIDO 500ML',
          qtd: 2,
          unidade: 'UN',
          vlUnit: 2.79,
        }
      : {
          mercado: ALFA,
          dias: 20 + 30 * k,
          produtoId: DETERGENTE_1L,
          descricao: 'DETERGENTE LIQUIDO 1L',
          qtd: 1,
          unidade: 'UN',
          vlUnit: k === 0 ? 6.29 : 5.99,
        },
  ),
  ...[30, 180, 330].map((dias) => ({
    mercado: GAMA,
    dias,
    produtoId: PILHA,
    descricao: 'PILHA AA C/4',
    qtd: 1,
    unidade: 'UN',
    vlUnit: 19.9,
  })),
  ...vezes(5, (k) => ({
    mercado: BETA,
    dias: 60 + 14 * k,
    produtoId: ACHOCOLATADO,
    descricao: 'ACHOCOLATADO PO 400G',
    qtd: 1,
    unidade: 'UN',
    vlUnit: 8.49,
  })),
  ...[28, 58].map((dias) => ({
    mercado: ALFA,
    dias,
    produtoId: AZEITE,
    descricao: 'AZEITE EXTRA VIRGEM 500ML',
    qtd: 1,
    unidade: 'UN',
    vlUnit: 32.9,
  })),
  ...vezes(16, (k) =>
    k % 2
      ? {
          mercado: BETA,
          dias: 25 + 21 * k,
          produtoId: ARROZ_BETA,
          descricao: 'ARROZ TIPO1 PCT 5KG',
          qtd: 1,
          unidade: 'UN',
          vlUnit: 22.9,
        }
      : {
          mercado: ALFA,
          dias: 25 + 21 * k,
          produtoId: ARROZ_ALFA,
          descricao: 'ARROZ T1 5KG',
          qtd: 1,
          unidade: 'UN',
          vlUnit: 24.9,
        },
  ),
];

function item(c: Compra, n: number): ItemNota {
  return {
    n,
    descricao: c.descricao,
    codigo: c.produtoId.split(':').at(-1)!,
    ean: c.produtoId.startsWith('ean:') ? c.produtoId.slice(4) : null,
    qtd: c.qtd,
    unidade: c.unidade,
    vlUnit: c.vlUnit,
    vlTotal: Math.round(c.qtd * c.vlUnit * 100) / 100,
    produtoId: c.produtoId,
    precoPorUnidadeBase: precoPorUnidadeBase(c.vlUnit, c.unidade, extrairConteudo(c.descricao)),
  };
}

/** Uma nota por mercado e dia, da mais recente para a mais antiga (como o `NotasService`). */
export function notasSugestao(hoje = HOJE_SUGESTAO): Nota[] {
  const porNota = new Map<string, Compra[]>();
  for (const c of COMPRAS) {
    const k = `${c.dias}|${c.mercado.cnpj}`;
    porNota.set(k, [...(porNota.get(k) ?? []), c]);
  }
  return [...porNota.values()]
    .map((compras) => {
      const { mercado, dias } = compras[0];
      const itens = compras.map((c, i) => item(c, i + 1));
      const emissao = new Date(hoje.getTime() - dias * 86_400_000).toISOString();
      const total = Math.round(itens.reduce((s, i) => s + i.vlTotal, 0) * 100) / 100;
      return {
        chave: `41${mercado.cnpj}${String(dias).padStart(4, '0')}`,
        cnpj: mercado.cnpj,
        estabelecimentoNome: mercado.nome,
        estabelecimentoCidade: 'CURITIBA',
        emissao,
        total,
        desconto: 0,
        qtdItens: itens.length,
        itens,
        importadaEm: emissao,
      };
    })
    .sort((a, b) => b.emissao.localeCompare(a.emissao) || a.chave.localeCompare(b.chave));
}
