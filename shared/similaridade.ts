import { tokens, tokensSemMedida } from './normalizar';

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Tokens da descrição dominante do grupo. Semente: o token presente em mais itens;
 * no empate, o que co-ocorre com mais tokens distintos (descrições de produto de
 * verdade são mais ricas que as de um GTIN cadastrado errado). A descrição dominante
 * são os tokens presentes em pelo menos metade dos itens que contêm a semente.
 * Tokens com dígito (medidas) ficam de fora: "2L", "2LT" e "2000ML" são o mesmo.
 */
export function descricaoDominante(descricoes: readonly string[]): string[] {
  const conjuntos = descricoes.map((d) => new Set(tokensSemMedida(d)));
  const df = new Map<string, number>();
  for (const c of conjuntos) for (const t of c) df.set(t, (df.get(t) ?? 0) + 1);
  if (df.size === 0) return [];

  const riqueza = (t: string) => {
    const vizinhos = new Set<string>();
    for (const c of conjuntos) if (c.has(t)) for (const v of c) if (v !== t) vizinhos.add(v);
    return vizinhos.size;
  };
  const semente = [...df.keys()].sort(
    (a, b) => df.get(b)! - df.get(a)! || riqueza(b) - riqueza(a) || a.localeCompare(b),
  )[0];

  const grupo = conjuntos.filter((c) => c.has(semente));
  const minimo = Math.ceil(grupo.length / 2);
  const noGrupo = new Map<string, number>();
  for (const c of grupo) for (const t of c) noGrupo.set(t, (noGrupo.get(t) ?? 0) + 1);
  return [...noGrupo].filter(([, n]) => n >= minimo).map(([t]) => t);
}

export function separarDivergentes<T>(
  itens: readonly T[],
  descricao: (t: T) => string,
  limiar = 0.3,
): { coerentes: T[]; divergentes: T[] } {
  const dominante = descricaoDominante(itens.map(descricao));
  if (dominante.length === 0) return { coerentes: [...itens], divergentes: [] };
  const coerentes: T[] = [];
  const divergentes: T[] = [];
  for (const item of itens) {
    const sim = jaccard(tokensSemMedida(descricao(item)), dominante);
    (sim >= limiar ? coerentes : divergentes).push(item);
  }
  return { coerentes, divergentes };
}

export interface EstabelecimentoComparavel {
  nome: string;
  logradouro?: string | null;
  numero?: string | null;
}

const SUFIXOS_EMPRESA = new Set([
  'LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S.A', 'CIA', 'COMERCIO', 'COM', 'IND', 'INDUSTRIA',
  'ALIMENTOS', 'SUPERMERCADO', 'SUPERMERCADOS', 'MERCADO', 'MERCADOS', 'LOJA', 'FILIAL',
]);

const TIPOS_LOGRADOURO = new Set(['R', 'RUA', 'AV', 'AVENIDA', 'AL', 'ALAMEDA', 'ROD', 'RODOVIA', 'TV', 'TRAVESSA', 'PC', 'PRACA', 'EST', 'ESTRADA']);

function tokensNome(nome: string): string[] {
  return tokens(nome).filter((t) => !SUFIXOS_EMPRESA.has(t));
}

function tokensLogradouro(logradouro: string): string[] {
  return tokens(logradouro).filter((t) => !TIPOS_LOGRADOURO.has(t));
}

function numeroDe(numero: string | null | undefined): string | null {
  const d = (numero ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return d || null;
}

export function mesmoEstabelecimento(a: EstabelecimentoComparavel, b: EstabelecimentoComparavel): boolean {
  if (jaccard(tokensNome(a.nome), tokensNome(b.nome)) < 0.5) return false;
  if (a.logradouro && b.logradouro) {
    if (jaccard(tokensLogradouro(a.logradouro), tokensLogradouro(b.logradouro)) < 0.5) return false;
  }
  const na = numeroDe(a.numero);
  const nb = numeroDe(b.numero);
  return !(na && nb && na !== nb);
}
