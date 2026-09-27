import type { ProdutoId } from './model';

const TAMANHOS = new Set([8, 12, 13, 14]);

export function digitoGtin(corpo: string): number {
  let soma = 0;
  for (let i = corpo.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
    soma += Number(corpo[i]) * peso;
  }
  return (10 - (soma % 10)) % 10;
}

/**
 * Devolve o GTIN canônico ou `null`. GTIN-12 e GTIN-14 com zero à esquerda viram
 * GTIN-13, para o mesmo produto ter um só `ean:` independente de como veio escrito.
 */
export function normalizarGtin(raw: string | null | undefined): string | null {
  if (!raw || /SEM\s*GTIN/i.test(raw)) return null;
  let d = raw.replace(/\D/g, '');
  if (!TAMANHOS.has(d.length) || /^0+$/.test(d)) return null;
  if (digitoGtin(d.slice(0, -1)) !== Number(d[d.length - 1])) return null;
  if (d.length === 12) d = `0${d}`;
  if (d.length === 14 && d.startsWith('0')) d = d.slice(1);
  return d;
}

export function codigoSeguro(codigo: string): string {
  return codigo.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '_') || '_';
}

export function produtoIdDe(ean: string | null | undefined, cnpj: string, codigo: string): ProdutoId {
  const gtin = normalizarGtin(ean);
  if (gtin) return `ean:${gtin}`;
  return `loc:${cnpj.replace(/\D/g, '')}:${codigoSeguro(codigo)}`;
}
