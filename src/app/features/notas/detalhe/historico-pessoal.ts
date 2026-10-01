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

export const JANELA_MELHOR_PRECO_DIAS = 60;

const DIA_MS = 24 * 60 * 60 * 1000;

export interface Tendencia {
  compra: CompraPessoal;
  valor: number;
  tendencia: 'subiu' | 'baixou' | 'igual';
  /** Atual − última, na base da comparação, com sinal. */
  diferenca: number;
}

export interface ComparacaoComValores {
  /** `acima` do melhor preço recente, ou no `melhor` (igual ou abaixo). */
  tipo: 'acima' | 'melhor';
  /** `unidade` = `vlUnit` (por unidade comercial); senão R$/kg, R$/L ou R$/un. */
  base: BaseComparacao;
  /** Compra do melhor preço na janela. */
  referencia: CompraPessoal;
  valorAtual: number;
  melhor: number;
  /** ≥ 0; 0 quando `melhor`. */
  diferenca: number;
  percentual: number;
  /** Diferença × quantidade desta nota; 0 quando `melhor`. */
  impacto: number;
  /** Abaixo do melhor preço recente. */
  novoMelhor: boolean;
  /** (Melhor − atual) × quantidade desta nota quando `novoMelhor`; senão 0. */
  economia: number;
  /** Última compra anterior, se a base a aceita: só tendência. */
  ultima: Tendencia | null;
  /** Menor valor dos 12 meses, contando esta compra. */
  menor: number;
  /** Média e quantidade das compras anteriores dos 12 meses (sem esta). */
  media: number;
  vezes: number;
  compras: CompraPessoal[];
}

export type ComparacaoHistorico =
  | { tipo: 'primeira-compra' }
  | { tipo: 'sem-recente'; ultima: CompraPessoal; compras: CompraPessoal[] }
  | { tipo: 'sem-comparacao'; compras: CompraPessoal[] }
  | ComparacaoComValores;

export interface ResumoHistorico {
  /** Σ impacto dos itens acima do melhor preço: quanto poderia ter economizado. */
  aMais: number;
  itensAcima: number;
  /** Σ economia dos novos melhores preços; mostrada à parte, nunca descontada de `aMais`. */
  economia: number;
  /** `aMais − economia`: positivo gastou a mais, negativo economizou. */
  saldo: number;
  /** Igual ou abaixo do melhor preço (inclui `itensNovoMelhor`). */
  itensNoMelhor: number;
  itensNovoMelhor: number;
  comparados: number;
  total: number;
}

export type FiltroHistorico = 'todos' | 'acima' | 'melhor' | 'primeira';

export const FILTROS_HISTORICO: readonly FiltroHistorico[] = [
  'todos',
  'acima',
  'melhor',
  'primeira',
];

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

export function unidadeNormalizada(unidade: string): string {
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
export function conteudoCompativel(a: string, b: string): boolean {
  const ca = extrairConteudo(a);
  const cb = extrairConteudo(b);
  return (
    !ca ||
    !cb ||
    (ca.unidadeBase === cb.unidadeBase && Math.abs(ca.quantidade - cb.quantidade) < 1e-6)
  );
}

export interface BaseComum {
  base: BaseComparacao;
  valor: (c: { vlUnit: number; porUnidade: PrecoPorUnidade | null }) => number;
  aceita: (c: CompraPessoal) => boolean;
}

interface Base extends BaseComum {
  quantidade: number;
}

function mesmaUnidadeQue(
  unidade: string,
  descricao: string,
): (c: Pick<CompraPessoal, 'unidade' | 'descricao'>) => boolean {
  const un = unidadeNormalizada(unidade);
  return (c) => unidadeNormalizada(c.unidade) === un && conteudoCompativel(descricao, c.descricao);
}

function porUnidadeBase(unidade: UnidadeBase): BaseComum {
  return {
    base: unidade,
    valor: (c) => c.porUnidade!.valor,
    aceita: (c) => c.porUnidade?.unidade === unidade,
  };
}

const PELO_VL_UNIT = (c: { vlUnit: number }) => c.vlUnit;

/**
 * RF-05, ancorada no item: `vlUnit` (mesma unidade comercial e conteúdo compatível) ou
 * R$/unidade base, a que aceitar mais candidatas (no empate, `vlUnit`); nenhuma → sem comparação.
 */
function baseDoItem(item: ItemNota, candidatas: readonly CompraPessoal[]): Base | null {
  const mesmaUnidade = mesmaUnidadeQue(item.unidade, item.descricao);
  const porVlUnit: Base = {
    base: 'unidade',
    valor: PELO_VL_UNIT,
    aceita: mesmaUnidade,
    quantidade: item.qtd,
  };
  const pu = item.precoPorUnidadeBase;
  const quantidade = pu ? quantidadeNaUnidadeBase(item.qtd, item.unidade, item.descricao) : null;
  const porBase: Base | null =
    pu && quantidade !== null ? { ...porUnidadeBase(pu.unidade), quantidade } : null;
  const nVlUnit = candidatas.filter(mesmaUnidade).length;
  const nBase = porBase ? candidatas.filter(porBase.aceita).length : 0;
  if (!nVlUnit && !nBase) return null;
  return porBase && nBase > nVlUnit ? porBase : porVlUnit;
}

function inicioDaJanelaDe(emissao: string): number {
  return Date.parse(emissao) - JANELA_MELHOR_PRECO_DIAS * DIA_MS;
}

/**
 * Base em que as compras podem ser comparadas, tomando a mais recente como referência: `vlUnit`
 * (mesma unidade comercial e conteúdo compatível) ou R$/unidade base, a que aceitar mais
 * compras (no empate, `vlUnit`). As compras que a base não aceita ficam de fora.
 */
export function baseComum(compras: readonly CompraPessoal[]): BaseComum | null {
  if (!compras.length) return null;
  const ref = compras.reduce((a, b) => (b.emissao > a.emissao ? b : a));
  const mesmaUnidade = mesmaUnidadeQue(ref.unidade, ref.descricao);
  const porVlUnit: BaseComum = { base: 'unidade', valor: PELO_VL_UNIT, aceita: mesmaUnidade };
  if (!ref.porUnidade) return porVlUnit;
  const porBase = porUnidadeBase(ref.porUnidade.unidade);
  const contar = (b: BaseComum) => compras.filter(b.aceita).length;
  return contar(porBase) > contar(porVlUnit) ? porBase : porVlUnit;
}

function tendencia(valorAtual: number, compra: CompraPessoal, valor: number): Tendencia {
  const bruto = valorAtual - valor;
  const igual = Math.abs(bruto) < CENTAVO;
  return {
    compra,
    valor,
    tendencia: igual ? 'igual' : bruto > 0 ? 'subiu' : 'baixou',
    diferenca: igual ? 0 : centavos(bruto),
  };
}

/**
 * RF-03 (D-03): compara com o menor preço que o usuário pagou, em qualquer mercado, nos
 * `JANELA_MELHOR_PRECO_DIAS` antes da emissão desta nota. A última compra é só tendência.
 */
export function compararItem(
  item: ItemNota,
  nota: Pick<Nota, 'chave' | 'emissao'>,
  compras: readonly CompraPessoal[],
): ComparacaoHistorico {
  const anteriores = compras.filter((c) => c.emissao < nota.emissao && c.chave !== nota.chave);
  const ultima = anteriores[0];
  if (!ultima) return { tipo: 'primeira-compra' };
  const recentes = anteriores.slice(0, COMPRAS_NA_EXPANSAO);
  const limite = inicioDaJanelaDe(nota.emissao);
  const naJanela = anteriores.filter((c) => Date.parse(c.emissao) >= limite);
  if (!naJanela.length) return { tipo: 'sem-recente', ultima, compras: recentes };
  const base = baseDoItem(item, naJanela);
  if (!base) return { tipo: 'sem-comparacao', compras: recentes };

  const referencia = naJanela
    .filter(base.aceita)
    .reduce((m, c) => (base.valor(c) < base.valor(m) - CENTAVO ? c : m));
  const valorAtual = base.valor({ vlUnit: item.vlUnit, porUnidade: item.precoPorUnidadeBase });
  const melhor = base.valor(referencia);
  const bruto = valorAtual - melhor;
  const acima = bruto >= CENTAVO;
  const novoMelhor = bruto <= -CENTAVO;
  const valores = anteriores.filter(base.aceita).map(base.valor);

  return {
    tipo: acima ? 'acima' : 'melhor',
    base: base.base,
    referencia,
    valorAtual,
    melhor,
    diferenca: acima ? centavos(bruto) : 0,
    percentual: acima && melhor ? Math.round((bruto / melhor) * 1000) / 10 : 0,
    impacto: acima ? centavos(bruto * base.quantidade) : 0,
    novoMelhor,
    economia: novoMelhor ? centavos(-bruto * base.quantidade) : 0,
    ultima: base.aceita(ultima) ? tendencia(valorAtual, ultima, base.valor(ultima)) : null,
    menor: Math.min(valorAtual, ...valores),
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
  return c && (c.tipo === 'acima' || c.tipo === 'melhor') ? c : null;
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
  let economia = 0;
  let itensAcima = 0;
  let itensNoMelhor = 0;
  let itensNovoMelhor = 0;
  let comparados = 0;
  for (const item of itens) {
    const c = comValores(r.get(item.n));
    if (!c) continue;
    comparados++;
    if (c.tipo === 'acima') {
      aMais += c.impacto;
      itensAcima++;
    } else {
      itensNoMelhor++;
      if (c.novoMelhor) {
        itensNovoMelhor++;
        economia += c.economia;
      }
    }
  }
  aMais = centavos(aMais);
  economia = centavos(economia);
  return {
    aMais,
    itensAcima,
    economia,
    saldo: centavos(aMais - economia),
    itensNoMelhor,
    itensNovoMelhor,
    comparados,
    total: itens.length,
  };
}

/** Itens (`n`) acima do melhor preço (por impacto) e novos melhores preços (por economia). */
export function destaques(r: ReadonlyMap<number, ComparacaoHistorico>): {
  altas: number[];
  quedas: number[];
} {
  const lista = [...r].flatMap(([n, c]) => {
    const v = comValores(c);
    return v ? [{ n, v }] : [];
  });
  const ordenar = (valor: (v: ComparacaoComValores) => number) =>
    lista
      .filter((x) => valor(x.v) > 0)
      .sort((a, b) => valor(b.v) - valor(a.v) || a.n - b.n)
      .map((x) => x.n);
  return { altas: ordenar((v) => v.impacto), quedas: ordenar((v) => v.economia) };
}

function passa(c: ComparacaoHistorico | undefined, filtro: FiltroHistorico): boolean {
  switch (filtro) {
    case 'acima':
      return c?.tipo === 'acima';
    case 'melhor':
      return c?.tipo === 'melhor';
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
