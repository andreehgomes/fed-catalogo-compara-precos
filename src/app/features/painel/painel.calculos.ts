import { nomeDoItem } from '@shared/nome-produto';
import type { Nota, ProdutoId } from '@shared/model';
import type { NotaComparada } from '../notas/data-access/historico-pessoal.store';
import {
  CompraPessoal,
  Grupos,
  baseComum,
  chaveDoGrupo,
  comValores,
  consolidarItens,
  sufixoDaBase,
} from '../notas/detalhe/historico-pessoal';

export const ALTA_MIN_PERCENTUAL = 5;
export const ALTA_MIN_REAIS = 0.1;
export const LIMITE_DESTAQUES = 5;

/** 'AAAA-MM' no horário local do aparelho. */
export type Mes = string;
export type EscolhaMes = 'atual' | 'anterior';

const arredondar = (n: number) => Math.round(n * 100) / 100;
const umaCasa = (n: number) => Math.round(n * 10) / 10;

export function totalDe(notas: readonly Nota[]): number {
  return arredondar(notas.reduce((s, n) => s + n.total, 0));
}

/** Variação percentual do mês em relação ao anterior; null sem base de comparação. */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

function mesDaData(d: Date): Mes {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function mesDe(iso: string): Mes {
  return mesDaData(new Date(iso));
}

export function somarMeses(mes: Mes, k: number): Mes {
  const [a, m] = mes.split('-').map(Number);
  return mesDaData(new Date(a, m - 1 + k, 1));
}

/** Primeiro dia do mês (data local), para rótulos e filtros. */
export function inicioDoMes(mes: Mes): Date {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m - 1, 1);
}

/** Query params da lista de notas para um mês inteiro. */
export function filtroDoMes(mes: Mes): { periodo: 'personalizado'; de: string; ate: string } {
  const [a, m] = mes.split('-').map(Number);
  const fim = new Date(a, m, 0).getDate();
  return {
    periodo: 'personalizado',
    de: `${mes}-01`,
    ate: `${mes}-${String(fim).padStart(2, '0')}`,
  };
}

/**
 * D-03: "atual" é o mês de hoje quando tem nota; senão o último mês com nota (o usuário compra uma
 * vez por mês e o painel não deve ficar zerado antes da compra). "anterior" é o mês calendário
 * anterior ao de hoje.
 */
export function mesDeReferencia(
  notas: readonly Nota[],
  hoje: Date,
  escolha: EscolhaMes,
): Mes | null {
  const atual = mesDaData(hoje);
  if (escolha === 'anterior') return somarMeses(atual, -1);
  const meses = notas.map((n) => mesDe(n.emissao)).filter((m) => m <= atual);
  if (meses.includes(atual)) return atual;
  return meses.length ? meses.reduce((a, b) => (b > a ? b : a)) : null;
}

export function notasDoMes<T extends Nota>(notas: readonly T[], mes: Mes): T[] {
  return notas.filter((n) => mesDe(n.emissao) === mes);
}

export interface VariacaoMes {
  percentual: number;
  base: number;
  /** Mês em curso: a base é o mês anterior só até o mesmo dia. */
  parcial: boolean;
  dia: number;
}

/** Mês em curso compara com o anterior do dia 1 até o mesmo dia; mês fechado, com o anterior inteiro. */
export function variacaoComparavel(
  notas: readonly Nota[],
  mes: Mes,
  hoje: Date,
): VariacaoMes | null {
  const parcial = mes === mesDaData(hoje);
  const dia = hoje.getDate();
  const anteriores = notasDoMes(notas, somarMeses(mes, -1)).filter(
    (n) => !parcial || new Date(n.emissao).getDate() <= dia,
  );
  const base = totalDe(anteriores);
  const percentual = variacao(totalDe(notasDoMes(notas, mes)), base);
  return percentual === null ? null : { percentual, base, parcial, dia };
}

export interface ResumoPeriodo {
  total: number;
  qtdNotas: number;
  ticketMedio: number;
  aMais: number;
  itensAcima: number;
  economia: number;
  itensNovoMelhor: number;
  /** `aMais − economia`: positivo gastou a mais, negativo economizou. */
  saldo: number;
  comparados: number;
}

export function resumoDoPeriodo(notas: readonly NotaComparada[]): ResumoPeriodo {
  let aMais = 0;
  let economia = 0;
  let itensAcima = 0;
  let itensNovoMelhor = 0;
  let comparados = 0;
  for (const { resumo } of notas) {
    aMais += resumo.aMais;
    economia += resumo.economia;
    itensAcima += resumo.itensAcima;
    itensNovoMelhor += resumo.itensNovoMelhor;
    comparados += resumo.comparados;
  }
  const total = totalDe(notas.map((c) => c.nota));
  return {
    total,
    qtdNotas: notas.length,
    ticketMedio: notas.length ? arredondar(total / notas.length) : 0,
    aMais: arredondar(aMais),
    itensAcima,
    economia: arredondar(economia),
    itensNovoMelhor,
    saldo: arredondar(aMais - economia),
    comparados,
  };
}

export interface BarraMes {
  mes: Mes;
  total: number;
  aMais: number;
  economia: number;
  saldo: number;
  qtdNotas: number;
  parcial: boolean;
}

/** Últimos `meses` meses até o de hoje (meses sem nota com zero), em ordem cronológica. */
export function seriesPorMes(
  notas: readonly NotaComparada[],
  hoje: Date,
  meses: number,
): BarraMes[] {
  const atual = mesDaData(hoje);
  return Array.from({ length: meses }, (_, i) => {
    const mes = somarMeses(atual, i - meses + 1);
    const r = resumoDoPeriodo(notas.filter((c) => mesDe(c.nota.emissao) === mes));
    return {
      mes,
      total: r.total,
      aMais: r.aMais,
      economia: r.economia,
      saldo: r.saldo,
      qtdNotas: r.qtdNotas,
      parcial: mes === atual,
    };
  });
}

export interface BarraCompra {
  chave: string;
  emissao: string;
  mercado: string;
  total: number;
  saldo: number;
}

/** D-04: uma barra por nota, em ordem cronológica, quando há menos de 2 meses com nota. */
export function barrasPorCompra(notas: readonly NotaComparada[]): BarraCompra[] {
  return [...notas]
    .sort((a, b) => a.nota.emissao.localeCompare(b.nota.emissao))
    .map(({ nota, resumo }) => ({
      chave: nota.chave,
      emissao: nota.emissao,
      mercado: nota.estabelecimentoNome,
      total: nota.total,
      saldo: resumo.saldo,
    }));
}

/**
 * Média dos meses fechados que têm nota; null sem nenhum. Mês sem nota fica fora: costuma ser
 * compra que não foi importada, não um mês sem gasto.
 */
export function mediaDosFechados(barras: readonly BarraMes[]): number | null {
  const fechados = barras.filter((b) => !b.parcial && b.qtdNotas > 0);
  if (!fechados.length) return null;
  return arredondar(fechados.reduce((s, b) => s + b.total, 0) / fechados.length);
}

export function mesesComNota(notas: readonly Nota[]): number {
  return new Set(notas.map((n) => mesDe(n.emissao))).size;
}

export interface GastoMercado {
  /** null = "Outros". */
  cnpj: string | null;
  nome: string;
  total: number;
  percentual: number;
  qtdNotas: number;
}

/** Top `limite` mercados por total, mais "Outros" com o resto. */
export function gastoPorMercado(notas: readonly Nota[], limite = LIMITE_DESTAQUES): GastoMercado[] {
  const porCnpj = new Map<string, { nome: string; emissao: string; total: number; qtd: number }>();
  for (const n of notas) {
    const m = porCnpj.get(n.cnpj) ?? { nome: '', emissao: '', total: 0, qtd: 0 };
    if (n.emissao > m.emissao) {
      m.nome = n.estabelecimentoNome;
      m.emissao = n.emissao;
    }
    m.total += n.total;
    m.qtd++;
    porCnpj.set(n.cnpj, m);
  }
  const soma = notas.reduce((s, n) => s + n.total, 0);
  const pct = (v: number) => (soma > 0 ? umaCasa((v / soma) * 100) : 0);
  const ordenados = [...porCnpj]
    .map(([cnpj, m]) => ({ cnpj, nome: m.nome, total: m.total, qtdNotas: m.qtd }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  const topo: GastoMercado[] = ordenados
    .slice(0, limite)
    .map((m) => ({ ...m, total: arredondar(m.total), percentual: pct(m.total) }));
  const resto = ordenados.slice(limite);
  if (resto.length) {
    const total = resto.reduce((s, m) => s + m.total, 0);
    topo.push({
      cnpj: null,
      nome: 'Outros',
      total: arredondar(total),
      percentual: pct(total),
      qtdNotas: resto.reduce((s, m) => s + m.qtdNotas, 0),
    });
  }
  return topo;
}

export interface DestaquePreco {
  chave: string;
  n: number;
  produtoId: ProdutoId;
  nome: string;
  /** Impacto (pagou mais) ou economia, já multiplicado pela quantidade. */
  valor: number;
  percentual: number;
  atual: number;
  melhor: number;
  sufixo: string;
  referencia: { mercado: string; emissao: string };
}

/** "Pagou mais" por impacto e "economizou" por economia, entre todas as notas do período. */
export function destaquesDoPeriodo(
  notas: readonly NotaComparada[],
  limite = LIMITE_DESTAQUES,
): { pagouMais: DestaquePreco[]; economizou: DestaquePreco[] } {
  const pagouMais: DestaquePreco[] = [];
  const economizou: DestaquePreco[] = [];
  for (const { nota, comparacao } of notas) {
    const itens = new Map(consolidarItens(nota.itens).map((i) => [i.n, i]));
    for (const [n, c] of comparacao) {
      const v = comValores(c);
      const item = itens.get(n);
      if (!v || !item) continue;
      const base = {
        chave: nota.chave,
        n,
        produtoId: item.produtoId,
        nome: nomeDoItem(item),
        atual: v.valorAtual,
        melhor: v.melhor,
        sufixo: sufixoDaBase(v),
        referencia: { mercado: v.referencia.mercado, emissao: v.referencia.emissao },
      };
      if (v.impacto > 0) pagouMais.push({ ...base, valor: v.impacto, percentual: v.percentual });
      if (v.economia > 0) {
        const percentual = umaCasa(((v.melhor - v.valorAtual) / v.melhor) * 100);
        economizou.push({ ...base, valor: v.economia, percentual });
      }
    }
  }
  const ordenar = (lista: DestaquePreco[]) =>
    lista.sort((a, b) => b.valor - a.valor).slice(0, limite);
  return { pagouMais: ordenar(pagouMais), economizou: ordenar(economizou) };
}

export interface AltaPreco {
  grupo: string;
  produtoId: ProdutoId;
  nome: string;
  de: number;
  para: number;
  percentual: number;
  sufixo: string;
  desde: string;
  em: string;
  vezes: number;
}

/**
 * D-05: primeira × última compra da janela (o índice vem da mais recente para a mais antiga), na base em que as compras do grupo são comparáveis.
 * Só altas de pelo menos `ALTA_MIN_PERCENTUAL` e `ALTA_MIN_REAIS`.
 */
export function precosQueSubiram(
  indice: ReadonlyMap<string, readonly CompraPessoal[]>,
  limite = LIMITE_DESTAQUES,
): AltaPreco[] {
  const altas: AltaPreco[] = [];
  for (const [grupo, compras] of indice) {
    const base = baseComum(compras);
    if (!base) continue;
    const aceitas = compras.filter(base.aceita);
    const vezes = new Set(aceitas.map((c) => c.chave)).size;
    if (vezes < 2) continue;
    const ultima = aceitas[0];
    const primeira = aceitas.at(-1)!;
    const de = base.valor(primeira);
    const para = base.valor(ultima);
    const diferenca = arredondar(para - de);
    if (de <= 0 || diferenca < ALTA_MIN_REAIS) continue;
    const percentual = umaCasa((diferenca / de) * 100);
    if (percentual < ALTA_MIN_PERCENTUAL) continue;
    altas.push({
      grupo,
      produtoId: ultima.produtoId,
      nome: nomeDoItem(ultima),
      de: arredondar(de),
      para: arredondar(para),
      percentual,
      sufixo: sufixoDaBase({ base: base.base, referencia: ultima }),
      desde: primeira.emissao,
      em: ultima.emissao,
      vezes,
    });
  }
  return altas.sort((a, b) => b.percentual - a.percentual).slice(0, limite);
}

export interface MaiorGasto {
  grupo: string;
  produtoId: ProdutoId;
  nome: string;
  total: number;
  compras: number;
  /** null quando as compras não estão todas na mesma unidade. */
  quantidade: number | null;
  unidade: string;
}

/** Produtos/grupos com maior valor somado (`vlTotal`) nas notas dadas. */
export function ondeMaisGasta(
  notas: readonly Nota[],
  grupos: Grupos,
  limite = LIMITE_DESTAQUES,
): MaiorGasto[] {
  const porGrupo = new Map<
    string,
    {
      total: number;
      chaves: Set<string>;
      qtd: number;
      unidades: Set<string>;
      emissao: string;
      produtoId: ProdutoId;
      nome: string;
      unidade: string;
    }
  >();
  for (const nota of notas) {
    for (const item of consolidarItens(nota.itens)) {
      const grupo = chaveDoGrupo(item.produtoId, grupos);
      const g = porGrupo.get(grupo) ?? {
        total: 0,
        chaves: new Set<string>(),
        qtd: 0,
        unidades: new Set<string>(),
        emissao: '',
        produtoId: item.produtoId,
        nome: '',
        unidade: item.unidade,
      };
      g.total += item.vlTotal;
      g.chaves.add(nota.chave);
      g.qtd += item.qtd;
      g.unidades.add(item.unidade.toUpperCase());
      if (nota.emissao > g.emissao) {
        g.emissao = nota.emissao;
        g.produtoId = item.produtoId;
        g.nome = nomeDoItem(item);
        g.unidade = item.unidade;
      }
      porGrupo.set(grupo, g);
    }
  }
  return [...porGrupo]
    .map(([grupo, g]) => ({
      grupo,
      produtoId: g.produtoId,
      nome: g.nome,
      total: arredondar(g.total),
      compras: g.chaves.size,
      quantidade: g.unidades.size === 1 ? Math.round(g.qtd * 1000) / 1000 : null,
      unidade: g.unidade,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}
