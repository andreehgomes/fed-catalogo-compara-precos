import { semAcento } from '@shared/normalizar';
import { extrairConteudo, quantidadeNaUnidadeBase } from '@shared/unidade';
import type {
  ItemNota,
  Nota,
  PrecoPorUnidade,
  Produto,
  ProdutoId,
  UnidadeBase,
} from '@shared/model';

export const CENTAVO = 0.005;
export const COMPRAS_NA_EXPANSAO = 5;

export interface CompraPessoal {
  chave: string;
  n: number;
  cnpj: string;
  mercado: string;
  emissao: string;
  produtoId: ProdutoId;
  descricao: string;
  qtd: number;
  unidade: string;
  vlUnit: number;
  porUnidade: PrecoPorUnidade | null;
}

/** produtoId → id do canônico; ausente = o próprio id. */
export type Grupos = ReadonlyMap<string, string>;

export type BaseComparacao = 'unidade' | UnidadeBase;

export interface ComparacaoComValores {
  tipo: 'mais-caro' | 'mais-barato' | 'igual';
  /** `unidade` = `vlUnit` (por unidade comercial); senão R$/kg, R$/L ou R$/un. */
  base: BaseComparacao;
  referencia: CompraPessoal;
  valorAtual: number;
  valorAnterior: number;
  diferenca: number;
  percentual: number;
  /** Diferença × quantidade desta nota, com sinal. */
  impacto: number;
  menor: number;
  media: number;
  vezes: number;
  compras: CompraPessoal[];
}

export type ComparacaoHistorico =
  | { tipo: 'primeira-compra' }
  | { tipo: 'sem-comparacao'; compras: CompraPessoal[] }
  | ComparacaoComValores;

export interface ResumoHistorico {
  aMais: number;
  itensAMais: number;
  /** Valor absoluto. */
  aMenos: number;
  itensAMenos: number;
  saldo: number;
  comparados: number;
  total: number;
}

export type FiltroHistorico = 'todos' | 'subiram' | 'baixaram' | 'primeira';

export const FILTROS_HISTORICO: readonly FiltroHistorico[] = [
  'todos',
  'subiram',
  'baixaram',
  'primeira',
];

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

function unidadeNormalizada(unidade: string): string {
  return semAcento(unidade).toUpperCase().trim();
}

/**
 * O cupom lança o mesmo produto várias vezes (um por leitura no caixa). Junta os lançamentos
 * do mesmo produto, unidade e preço unitário numa linha, somando quantidade e total; o item
 * fica com o `n` do primeiro lançamento. Preços diferentes continuam em linhas separadas.
 */
export function consolidarItens(itens: readonly ItemNota[]): ItemNota[] {
  const porChave = new Map<string, ItemNota>();
  for (const item of itens) {
    const chave = `${item.produtoId}|${unidadeNormalizada(item.unidade)}|${item.vlUnit}`;
    const existente = porChave.get(chave);
    porChave.set(
      chave,
      existente
        ? {
            ...existente,
            qtd: Math.round((existente.qtd + item.qtd) * 1000) / 1000,
            vlTotal: centavos(existente.vlTotal + item.vlTotal),
          }
        : item,
    );
  }
  return [...porChave.values()];
}

export function montarGrupos(
  produtosDaNota: ReadonlyMap<string, Produto>,
  membros: readonly Produto[],
): Map<string, string> {
  const grupos = new Map<string, string>();
  for (const [id, p] of produtosDaNota) {
    const canonico = p.vinculadoA ?? p.id;
    grupos.set(id, canonico);
    grupos.set(canonico, canonico);
  }
  for (const m of membros) if (m.vinculadoA) grupos.set(m.id, m.vinculadoA);
  return grupos;
}

export function chaveDoGrupo(produtoId: string, grupos: Grupos): string {
  return grupos.get(produtoId) ?? produtoId;
}

export function indexarCompras(
  notas: readonly Nota[],
  grupos: Grupos,
): Map<string, CompraPessoal[]> {
  const indice = new Map<string, CompraPessoal[]>();
  for (const nota of notas) {
    for (const item of consolidarItens(nota.itens)) {
      const chave = chaveDoGrupo(item.produtoId, grupos);
      const lista = indice.get(chave) ?? [];
      lista.push({
        chave: nota.chave,
        n: item.n,
        cnpj: nota.cnpj,
        mercado: nota.estabelecimentoNome,
        emissao: nota.emissao,
        produtoId: item.produtoId,
        descricao: item.descricao,
        qtd: item.qtd,
        unidade: item.unidade,
        vlUnit: item.vlUnit,
        porUnidade: item.precoPorUnidadeBase ?? null,
      });
      indice.set(chave, lista);
    }
  }
  for (const lista of indice.values()) {
    lista.sort(
      (a, b) => b.emissao.localeCompare(a.emissao) || a.chave.localeCompare(b.chave) || a.n - b.n,
    );
  }
  return indice;
}

/** Mesmo conteúdo, ou conteúdo desconhecido em um dos lados (não dá para afirmar que difere). */
function conteudoCompativel(a: string, b: string): boolean {
  const ca = extrairConteudo(a);
  const cb = extrairConteudo(b);
  return (
    !ca ||
    !cb ||
    (ca.unidadeBase === cb.unidadeBase && Math.abs(ca.quantidade - cb.quantidade) < 1e-6)
  );
}

interface Base {
  base: BaseComparacao;
  valor: (c: { vlUnit: number; porUnidade: PrecoPorUnidade | null }) => number;
  aceita: (c: CompraPessoal) => boolean;
  quantidade: number;
}

/**
 * RF-05: mesma unidade comercial com o mesmo conteúdo → `vlUnit`; senão R$/unidade base
 * dos dois lados; senão não há comparação.
 */
function escolherBase(item: ItemNota, ref: CompraPessoal): Base | null {
  const un = unidadeNormalizada(item.unidade);
  const mesmaUnidade = (c: CompraPessoal) =>
    unidadeNormalizada(c.unidade) === un && conteudoCompativel(item.descricao, c.descricao);
  if (mesmaUnidade(ref)) {
    return { base: 'unidade', valor: (c) => c.vlUnit, aceita: mesmaUnidade, quantidade: item.qtd };
  }
  const pu = item.precoPorUnidadeBase;
  if (pu && ref.porUnidade?.unidade === pu.unidade) {
    const quantidade = quantidadeNaUnidadeBase(item.qtd, item.unidade, item.descricao);
    if (quantidade !== null) {
      return {
        base: pu.unidade,
        valor: (c) => c.porUnidade!.valor,
        aceita: (c) => c.porUnidade?.unidade === pu.unidade,
        quantidade,
      };
    }
  }
  return null;
}

/** RF-03: compara com a última compra do mesmo produto antes desta nota. */
export function compararItem(
  item: ItemNota,
  nota: Pick<Nota, 'chave' | 'emissao'>,
  compras: readonly CompraPessoal[],
): ComparacaoHistorico {
  const candidatas = compras.filter((c) => c.emissao < nota.emissao && c.chave !== nota.chave);
  const ref = candidatas[0];
  if (!ref) return { tipo: 'primeira-compra' };
  const recentes = candidatas.slice(0, COMPRAS_NA_EXPANSAO);
  const base = escolherBase(item, ref);
  if (!base) return { tipo: 'sem-comparacao', compras: recentes };

  const valorAtual = base.valor({ vlUnit: item.vlUnit, porUnidade: item.precoPorUnidadeBase });
  const valorAnterior = base.valor(ref);
  const bruto = valorAtual - valorAnterior;
  const igual = Math.abs(bruto) < CENTAVO;
  const valores = candidatas.filter(base.aceita).map(base.valor);

  return {
    tipo: igual ? 'igual' : bruto > 0 ? 'mais-caro' : 'mais-barato',
    base: base.base,
    referencia: ref,
    valorAtual,
    valorAnterior,
    diferenca: igual ? 0 : centavos(bruto),
    percentual: igual || !valorAnterior ? 0 : Math.round((bruto / valorAnterior) * 1000) / 10,
    impacto: igual ? 0 : centavos(bruto * base.quantidade),
    menor: Math.min(...valores),
    media: centavos(valores.reduce((s, v) => s + v, 0) / valores.length),
    vezes: valores.length,
    compras: recentes,
  };
}

export function compararNota(
  nota: Nota,
  indice: ReadonlyMap<string, readonly CompraPessoal[]>,
  grupos: Grupos,
): Map<number, ComparacaoHistorico> {
  const r = new Map<number, ComparacaoHistorico>();
  for (const item of consolidarItens(nota.itens)) {
    r.set(item.n, compararItem(item, nota, indice.get(chaveDoGrupo(item.produtoId, grupos)) ?? []));
  }
  return r;
}

export function comValores(c: ComparacaoHistorico | undefined): ComparacaoComValores | null {
  return c && (c.tipo === 'mais-caro' || c.tipo === 'mais-barato' || c.tipo === 'igual') ? c : null;
}

const SUFIXO_COMERCIAL: Readonly<Record<string, string>> = {
  UN: '/un',
  UND: '/un',
  UNID: '/un',
  KG: '/kg',
  KGS: '/kg',
  L: '/L',
  LT: '/L',
};

/** "/un", "/kg", "/L"… da unidade em que a comparação foi feita. */
export function sufixoDaBase(v: Pick<ComparacaoComValores, 'base' | 'referencia'>): string {
  if (v.base !== 'unidade') return `/${v.base}`;
  const un = unidadeNormalizada(v.referencia.unidade);
  return SUFIXO_COMERCIAL[un] ?? `/${v.referencia.unidade.toLowerCase()}`;
}

export function resumirHistorico(
  itens: readonly ItemNota[],
  r: ReadonlyMap<number, ComparacaoHistorico>,
): ResumoHistorico {
  let aMais = 0;
  let aMenos = 0;
  let itensAMais = 0;
  let itensAMenos = 0;
  let comparados = 0;
  for (const item of itens) {
    const c = comValores(r.get(item.n));
    if (!c) continue;
    comparados++;
    if (c.tipo === 'mais-caro') {
      aMais += c.impacto;
      itensAMais++;
    } else if (c.tipo === 'mais-barato') {
      aMenos -= c.impacto;
      itensAMenos++;
    }
  }
  aMais = centavos(aMais);
  aMenos = centavos(aMenos);
  return {
    aMais,
    itensAMais,
    aMenos,
    itensAMenos,
    saldo: centavos(aMais - aMenos),
    comparados,
    total: itens.length,
  };
}

/** Itens (`n`) com as maiores altas e quedas, por |impacto|. */
export function destaques(
  r: ReadonlyMap<number, ComparacaoHistorico>,
  limite = Infinity,
): { altas: number[]; quedas: number[] } {
  const lista = [...r].flatMap(([n, c]) => {
    const v = comValores(c);
    return v ? [{ n, v }] : [];
  });
  const ordenar = (tipo: 'mais-caro' | 'mais-barato') =>
    lista
      .filter((x) => x.v.tipo === tipo)
      .sort((a, b) => Math.abs(b.v.impacto) - Math.abs(a.v.impacto) || a.n - b.n)
      .slice(0, limite)
      .map((x) => x.n);
  return { altas: ordenar('mais-caro'), quedas: ordenar('mais-barato') };
}

function passa(c: ComparacaoHistorico | undefined, filtro: FiltroHistorico): boolean {
  switch (filtro) {
    case 'subiram':
      return c?.tipo === 'mais-caro';
    case 'baixaram':
      return c?.tipo === 'mais-barato';
    case 'primeira':
      return c?.tipo === 'primeira-compra';
    default:
      return true;
  }
}

export function filtrarItens(
  itens: readonly ItemNota[],
  r: ReadonlyMap<number, ComparacaoHistorico>,
  filtro: FiltroHistorico,
): ItemNota[] {
  return itens.filter((i) => passa(r.get(i.n), filtro));
}

export function contarPorFiltro(
  itens: readonly ItemNota[],
  r: ReadonlyMap<number, ComparacaoHistorico>,
): Record<FiltroHistorico, number> {
  return Object.fromEntries(
    FILTROS_HISTORICO.map((f) => [f, filtrarItens(itens, r, f).length]),
  ) as Record<FiltroHistorico, number>;
}
