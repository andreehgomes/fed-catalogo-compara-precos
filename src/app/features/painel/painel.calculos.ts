import type { Nota, Produto } from '@shared/model';

const arredondar = (n: number) => Math.round(n * 100) / 100;

export function totalDe(notas: readonly Nota[]): number {
  return arredondar(notas.reduce((s, n) => s + n.total, 0));
}

/** Variação percentual do mês em relação ao anterior; null sem base de comparação. */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

/**
 * Economia potencial: Σ (vlUnit − menor preço conhecido na base comunitária) × qtd,
 * só quando positiva. Não consulta o Menor Preço (evita N requisições a cada abertura).
 */
export function economiaPotencial(
  notas: readonly Nota[],
  produtos: ReadonlyMap<string, Produto>,
): number {
  let total = 0;
  for (const nota of notas) {
    for (const item of nota.itens) {
      const menor = produtos.get(item.produtoId)?.menorPreco?.vlUnit;
      if (menor !== undefined && item.vlUnit - menor > 0.005)
        total += (item.vlUnit - menor) * item.qtd;
    }
  }
  return arredondar(total);
}
