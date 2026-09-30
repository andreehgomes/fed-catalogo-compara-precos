import type { Conteudo, PrecoPorUnidade, UnidadeBase } from './model';
import { semAcento } from './normalizar';

const FATOR: Readonly<Record<string, { base: UnidadeBase; fator: number }>> = {
  KG: { base: 'kg', fator: 1 },
  KGS: { base: 'kg', fator: 1 },
  G: { base: 'kg', fator: 0.001 },
  GR: { base: 'kg', fator: 0.001 },
  GRS: { base: 'kg', fator: 0.001 },
  L: { base: 'L', fator: 1 },
  LT: { base: 'L', fator: 1 },
  LTS: { base: 'L', fator: 1 },
  ML: { base: 'L', fator: 0.001 },
  UN: { base: 'un', fator: 1 },
  UND: { base: 'un', fator: 1 },
  UNID: { base: 'un', fator: 1 },
};

const UNIDADES = 'KGS|KG|GRS|GR|G|LTS|LT|L|ML|UNID|UND|UN';
const NUM = '\\d+(?:\\.\\d+)?';
const MULTIPLO = new RegExp(`(?<![\\d.])(\\d+)\\s*X\\s*(${NUM})\\s*(${UNIDADES})(?![A-Z])`);
const MEDIDA = new RegExp(`(?<![\\d.])(${NUM})\\s*(${UNIDADES})(?![A-Z])`);
const EMBALAGEM = /(?:^|\s)C\s*\/\s*(\d+)(?!\d)/;

function preparar(descricao: string): string {
  return semAcento(descricao)
    .toUpperCase()
    .replace(/(\d),(\d)/g, '$1.$2');
}

function arredondar(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function extrairConteudo(descricao: string): Conteudo | null {
  const d = preparar(descricao);

  const multiplo = MULTIPLO.exec(d);
  if (multiplo) {
    const { base, fator } = FATOR[multiplo[3]];
    return {
      quantidade: arredondar(Number(multiplo[1]) * Number(multiplo[2]) * fator),
      unidadeBase: base,
    };
  }

  const medida = MEDIDA.exec(d);
  const embalagem = EMBALAGEM.exec(d);
  const n = embalagem ? Number(embalagem[1]) : 1;

  if (medida) {
    const { base, fator } = FATOR[medida[2]];
    const quantidade = Number(medida[1]) * fator * (base === 'un' ? 1 : n);
    return quantidade > 0 ? { quantidade: arredondar(quantidade), unidadeBase: base } : null;
  }
  if (embalagem && n > 0) return { quantidade: n, unidadeBase: 'un' };
  return null;
}

/** Unidade base quando a nota vende a granel (KG, G, L, ML…); `null` para UN, CX, PCT… */
export function baseDoGranel(unidadeNota: string): UnidadeBase | null {
  const vendidoPor = FATOR[semAcento(unidadeNota).toUpperCase().trim()];
  return vendidoPor && vendidoPor.base !== 'un' ? vendidoPor.base : null;
}

export function precoPorUnidadeBase(
  vlUnit: number,
  unidadeNota: string,
  conteudo: Conteudo | null,
): PrecoPorUnidade | null {
  const un = semAcento(unidadeNota).toUpperCase().trim();
  const vendidoPor = FATOR[un];
  if (vendidoPor && vendidoPor.base !== 'un') {
    return { valor: arredondar(vlUnit / vendidoPor.fator), unidade: vendidoPor.base };
  }
  if (!conteudo || conteudo.quantidade <= 0) return null;
  return { valor: arredondar(vlUnit / conteudo.quantidade), unidade: conteudo.unidadeBase };
}

/**
 * Quantidade comprada na unidade base de `precoPorUnidadeBase` (kg, L ou un), para
 * multiplicar uma diferença em R$/kg ou R$/L. `null` quando o conteúdo é desconhecido.
 */
export function quantidadeNaUnidadeBase(
  qtd: number,
  unidadeNota: string,
  descricao: string,
): number | null {
  const un = semAcento(unidadeNota).toUpperCase().trim();
  const vendidoPor = FATOR[un];
  if (vendidoPor && vendidoPor.base !== 'un') return arredondar(qtd * vendidoPor.fator);
  const conteudo = extrairConteudo(descricao);
  if (!conteudo || conteudo.quantidade <= 0) return null;
  return arredondar(qtd * conteudo.quantidade);
}
