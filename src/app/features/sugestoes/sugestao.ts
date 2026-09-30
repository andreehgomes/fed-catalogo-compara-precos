import type { DataIso, UnidadeBase } from '@shared/model';
import { baseDoGranel, quantidadeNaUnidadeBase } from '@shared/unidade';
import {
  BaseComparacao,
  CENTAVO,
  CompraPessoal,
  baseComum,
  sufixoDaBase,
  unidadeNormalizada,
} from '../notas/detalhe/historico-pessoal';

export type EstadoSugestao = 'repor' | 'em-breve' | 'parou';
export type Confianca = 'alta' | 'media' | 'baixa';
export type Horizonte = 'hoje' | 'semana' | 'quinzena' | 'mes';
export type VisaoSugestao = 'lista' | 'mercado';

export const MIN_OCASIOES = 3;
export const JUNTAR_DIAS = 2;
export const CICLO_MIN_DIAS = 3;
export const CICLO_MAX_DIAS = 120;
export const EM_BREVE_A_PARTIR = 0.8;
export const PAROU_ACIMA = 3;
export const CV_INSTAVEL = 0.6;
export const DIAS_HORIZONTE: Record<Horizonte, number> = {
  hoje: 0,
  semana: 7,
  quinzena: 15,
  mes: 30,
};
export const HORIZONTES: readonly Horizonte[] = ['hoje', 'semana', 'quinzena', 'mes'];

const DIA = 86_400_000;
const ORDEM_ESTADO: Record<EstadoSugestao, number> = { repor: 0, 'em-breve': 1, parou: 2 };
const ORDEM_CONFIANCA: Record<Confianca, number> = { alta: 0, media: 1, baixa: 2 };

/** Compras do mesmo grupo com menos de `JUNTAR_DIAS` entre si; `data` é a mais recente delas. */
export interface Ocasiao {
  data: DataIso;
  compras: CompraPessoal[];
}

export interface QuantidadeSugerida {
  valor: number;
  /** `kg`, `L` ou `un` quando `base`; senão a unidade comercial normalizada (`UN`, `PCT`…). */
  unidade: string;
  base: UnidadeBase | null;
}

export interface PrecoPago {
  compra: CompraPessoal;
  /** Na base da faixa (`vlUnit` ou R$/unidade base). */
  valor: number;
}

/** RF-07: só o que o próprio usuário pagou. */
export interface FaixaDePreco {
  base: BaseComparacao;
  /** "/un", "/kg", "/L"… */
  sufixo: string;
  ultimoPago: PrecoPago;
  maisBarato: PrecoPago;
  maisCaro: PrecoPago;
}

/** Último preço que o usuário pagou em cada mercado (cnpj → compra). */
export type UltimoPorMercado = ReadonlyMap<string, CompraPessoal>;

export interface Sugestao {
  /** Chave do grupo = id do produto canônico. */
  grupo: string;
  descricao: string;
  estado: EstadoSugestao;
  confianca: Confianca;
  cicloDias: number;
  diasDesdeUltima: number;
  proximaPrevista: DataIso;
  quantidade: QuantidadeSugerida;
  ultimaCompra: CompraPessoal;
  /** Em ordem cronológica. */
  ocasioes: Ocasiao[];
  faixa: FaixaDePreco;
  porMercado: UltimoPorMercado;
}

export interface DispensadosSugestao {
  jaTenho: ReadonlyMap<string, DataIso>;
  nunca: ReadonlySet<string>;
}

/** Sugestão selecionada, com a quantidade que o usuário deixou. */
export interface ItemDaLista {
  sugestao: Sugestao;
  quantidade: number;
}

export interface TotaisDaLista {
  comoDaUltimaVez: number;
  noMenorPreco: number;
  economia: number;
  itensComPreco: number;
  itens: number;
}

export interface ItemNoMercado {
  grupo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  /** Preço na unidade da quantidade; `null` quando a compra lá não é comparável. */
  preco: number | null;
  subtotal: number | null;
}

export interface GrupoPorMercado {
  cnpj: string;
  mercado: string;
  itens: ItemNoMercado[];
  total: number;
}

export interface Cesta {
  cnpj: string;
  mercado: string;
  cobertos: ItemNoMercado[];
  faltando: string[];
  total: number;
}

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

function ms(data: DataIso): number {
  return new Date(data).getTime();
}

export function mediana(valores: readonly number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** RF-02. Recebe as compras da mais recente para a mais antiga; devolve em ordem cronológica. */
export function ocasioes(compras: readonly CompraPessoal[]): Ocasiao[] {
  const r: Ocasiao[] = [];
  for (const c of [...compras].reverse()) {
    const atual = r.at(-1);
    if (atual && ms(c.emissao) - ms(atual.data) < JUNTAR_DIAS * DIA) {
      atual.compras.push(c);
      atual.data = c.emissao;
    } else {
      r.push({ data: c.emissao, compras: [c] });
    }
  }
  return r;
}

export function intervalos(oc: readonly Ocasiao[]): number[] {
  return oc.slice(1).map((o, i) => Math.round((ms(o.data) - ms(oc[i].data)) / DIA));
}

/** RF-03: mediana dos intervalos, com piso de `CICLO_MIN_DIAS`. */
export function ciclo(oc: readonly Ocasiao[]): number | null {
  if (oc.length < 2) return null;
  return Math.max(CICLO_MIN_DIAS, mediana(intervalos(oc)));
}

/** RF-04, com `atraso = diasDesde / ciclo`. */
export function estadoDaSugestao(
  diasDesde: number,
  cicloDias: number,
  horizonte: Horizonte,
): EstadoSugestao | null {
  const atraso = diasDesde / cicloDias;
  if (atraso > PAROU_ACIMA) return 'parou';
  if (atraso >= 1) return 'repor';
  if (atraso >= EM_BREVE_A_PARTIR || diasDesde + DIAS_HORIZONTE[horizonte] >= cicloDias) {
    return 'em-breve';
  }
  return null;
}

/** RF-05: pela contagem de ocasiões, um nível abaixo quando os intervalos variam demais. */
export function confianca(oc: readonly Ocasiao[], dias: readonly number[]): Confianca {
  const nivel = oc.length >= 5 ? 0 : oc.length >= MIN_OCASIOES ? 1 : 2;
  const media = dias.reduce((s, d) => s + d, 0) / dias.length;
  const desvio = Math.sqrt(dias.reduce((s, d) => s + (d - media) ** 2, 0) / dias.length);
  const instavel = dias.length >= 2 && desvio / media > CV_INSTAVEL;
  return (['alta', 'media', 'baixa'] as const)[Math.min(2, nivel + (instavel ? 1 : 0))];
}

/**
 * Só o que é vendido a granel vira kg/L: "AGUA 1L" comprada por UN é sugerida em UN (não existe
 * embalagem de 1,5 L), e a mistura de tamanhos também fica na unidade comercial.
 */
function naBase(c: CompraPessoal): { valor: number; unidade: UnidadeBase } | null {
  const unidade = baseDoGranel(c.unidade);
  return unidade
    ? { valor: quantidadeNaUnidadeBase(c.qtd, c.unidade, c.descricao)!, unidade }
    : null;
}

function arredondar(valor: number, unidade: string): number {
  return unidade === 'kg' || unidade === 'L'
    ? Math.round(valor * 1000) / 1000
    : Math.max(1, Math.round(valor));
}

/** RF-06: mediana por ocasião, em kg/L quando tudo foi comprado a granel; senão na unidade comercial. */
export function quantidadeSugerida(oc: readonly Ocasiao[]): QuantidadeSugerida {
  const compras = oc.flatMap((o) => o.compras);
  const bases = compras.map(naBase);
  const base = bases[0]?.unidade;
  if (base && bases.every((b) => b?.unidade === base)) {
    const porOcasiao = oc.map((o) => o.compras.reduce((s, c) => s + naBase(c)!.valor, 0));
    return { valor: arredondar(mediana(porOcasiao), base), unidade: base, base };
  }
  const contagem = new Map<string, number>();
  for (const c of compras) {
    const un = unidadeNormalizada(c.unidade);
    contagem.set(un, (contagem.get(un) ?? 0) + 1);
  }
  const unidade = [...contagem].sort((a, b) => b[1] - a[1])[0][0];
  const porOcasiao = oc
    .map((o) =>
      o.compras
        .filter((c) => unidadeNormalizada(c.unidade) === unidade)
        .reduce((s, c) => s + c.qtd, 0),
    )
    .filter((q) => q > 0);
  return { valor: arredondar(mediana(porOcasiao), unidade), unidade, base: null };
}

function maisRecentePrimeiro(compras: readonly CompraPessoal[]): CompraPessoal[] {
  return [...compras].sort((a, b) => b.emissao.localeCompare(a.emissao));
}

/** RF-07. No empate de valor fica a compra mais recente. */
export function faixaDePreco(compras: readonly CompraPessoal[]): FaixaDePreco {
  const ordenadas = maisRecentePrimeiro(compras);
  const b = baseComum(ordenadas)!;
  const precos = ordenadas.filter(b.aceita).map((compra) => ({ compra, valor: b.valor(compra) }));
  const ultimoPago = precos[0];
  let maisBarato = ultimoPago;
  let maisCaro = ultimoPago;
  for (const p of precos) {
    if (p.valor < maisBarato.valor - CENTAVO) maisBarato = p;
    if (p.valor > maisCaro.valor + CENTAVO) maisCaro = p;
  }
  return {
    base: b.base,
    sufixo: sufixoDaBase({ base: b.base, referencia: ultimoPago.compra }),
    ultimoPago,
    maisBarato,
    maisCaro,
  };
}

/** RF-09: a compra mais recente de cada mercado. */
export function ultimoPorMercado(compras: readonly CompraPessoal[]): Map<string, CompraPessoal> {
  const r = new Map<string, CompraPessoal>();
  for (const c of maisRecentePrimeiro(compras)) if (!r.has(c.cnpj)) r.set(c.cnpj, c);
  return r;
}

/** Preço da compra na unidade da quantidade sugerida, ou `null` se não dá para converter. */
export function precoNaQuantidade(q: QuantidadeSugerida, c: CompraPessoal): number | null {
  if (q.base) return c.porUnidade?.unidade === q.base ? c.porUnidade.valor : null;
  return unidadeNormalizada(c.unidade) === q.unidade ? c.vlUnit : null;
}

function jaTem(
  grupo: string,
  oc: readonly Ocasiao[],
  cicloDias: number,
  hoje: Date,
  d: DispensadosSugestao,
) {
  const marcado = d.jaTenho.get(grupo);
  if (!marcado) return false;
  const comprouDepois = oc.at(-1)!.data > marcado;
  return !comprouDepois && hoje.getTime() < ms(marcado) + cicloDias * DIA;
}

/** RF-01: grupos com ao menos `MIN_OCASIOES` ocasiões na janela. */
export function contarRecorrentes(indice: ReadonlyMap<string, readonly CompraPessoal[]>): number {
  let n = 0;
  for (const compras of indice.values()) {
    if (ocasioes(maisRecentePrimeiro(compras)).length >= MIN_OCASIOES) n++;
  }
  return n;
}

/** RF-01 a RF-07 e RF-12. Ordena por estado, confiança e atraso. */
export function sugerir(
  indice: ReadonlyMap<string, readonly CompraPessoal[]>,
  hoje: Date,
  horizonte: Horizonte,
  dispensados: DispensadosSugestao,
): Sugestao[] {
  const r: Sugestao[] = [];
  for (const [grupo, compras] of indice) {
    if (dispensados.nunca.has(grupo)) continue;
    const oc = ocasioes(maisRecentePrimeiro(compras));
    const cicloDias = ciclo(oc);
    if (cicloDias === null || cicloDias > CICLO_MAX_DIAS) continue;
    const ultima = oc.at(-1)!;
    const diasDesdeUltima = Math.max(0, Math.floor((hoje.getTime() - ms(ultima.data)) / DIA));
    const estado = estadoDaSugestao(diasDesdeUltima, cicloDias, horizonte);
    if (!estado || jaTem(grupo, oc, cicloDias, hoje, dispensados)) continue;
    const faixa = faixaDePreco(compras);
    r.push({
      grupo,
      descricao: faixa.ultimoPago.compra.descricao,
      estado,
      confianca: confianca(oc, intervalos(oc)),
      cicloDias,
      diasDesdeUltima,
      proximaPrevista: new Date(ms(ultima.data) + cicloDias * DIA).toISOString(),
      quantidade: quantidadeSugerida(oc),
      ultimaCompra: faixa.ultimoPago.compra,
      ocasioes: oc,
      faixa,
      porMercado: ultimoPorMercado(compras),
    });
  }
  return r.sort(
    (a, b) =>
      ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado] ||
      ORDEM_CONFIANCA[a.confianca] - ORDEM_CONFIANCA[b.confianca] ||
      b.diasDesdeUltima / b.cicloDias - a.diasDesdeUltima / a.cicloDias ||
      a.descricao.localeCompare(b.descricao),
  );
}

/** RF-08: os dois totais e a economia, a economia só sobre os itens que têm os dois preços. */
export function totaisDaLista(itens: readonly ItemDaLista[]): TotaisDaLista {
  let comoDaUltimaVez = 0;
  let noMenorPreco = 0;
  let economia = 0;
  let itensComPreco = 0;
  for (const { sugestao: s, quantidade } of itens) {
    const ultimo = precoNaQuantidade(s.quantidade, s.faixa.ultimoPago.compra);
    const menor = precoNaQuantidade(s.quantidade, s.faixa.maisBarato.compra);
    if (ultimo !== null) {
      comoDaUltimaVez += ultimo * quantidade;
      itensComPreco++;
    }
    if (menor !== null) noMenorPreco += menor * quantidade;
    if (ultimo !== null && menor !== null) economia += (ultimo - menor) * quantidade;
  }
  return {
    comoDaUltimaVez: centavos(comoDaUltimaVez),
    noMenorPreco: centavos(noMenorPreco),
    economia: centavos(economia),
    itensComPreco,
    itens: itens.length,
  };
}

function noMercado(item: ItemDaLista, compra: CompraPessoal | undefined): ItemNoMercado {
  const { sugestao: s, quantidade } = item;
  const preco = compra ? precoNaQuantidade(s.quantidade, compra) : null;
  return {
    grupo: s.grupo,
    descricao: s.descricao,
    quantidade,
    unidade: s.quantidade.unidade,
    preco,
    subtotal: preco === null ? null : centavos(preco * quantidade),
  };
}

function somar(itens: readonly ItemNoMercado[]): number {
  return centavos(itens.reduce((s, i) => s + (i.subtotal ?? 0), 0));
}

function nomeDoMercado(itens: readonly ItemDaLista[], cnpj: string): string {
  return itens.find((i) => i.sugestao.porMercado.has(cnpj))!.sugestao.porMercado.get(cnpj)!.mercado;
}

/**
 * RF-09: cada item no mercado onde o último preço pago foi o menor (empate → compra mais
 * recente). Sem preço comparável em nenhum, fica no mercado da última compra.
 */
export function agruparPorMaisBarato(itens: readonly ItemDaLista[]): GrupoPorMercado[] {
  const grupos = new Map<string, ItemNoMercado[]>();
  for (const item of itens) {
    const s = item.sugestao;
    let escolhido = s.ultimaCompra;
    let menor = Infinity;
    for (const c of maisRecentePrimeiro([...s.porMercado.values()])) {
      const p = precoNaQuantidade(s.quantidade, c);
      if (p !== null && p < menor - CENTAVO) {
        menor = p;
        escolhido = c;
      }
    }
    const lista = grupos.get(escolhido.cnpj) ?? [];
    lista.push(noMercado(item, escolhido));
    grupos.set(escolhido.cnpj, lista);
  }
  return [...grupos]
    .map(([cnpj, lista]) => ({
      cnpj,
      mercado: nomeDoMercado(itens, cnpj),
      itens: lista,
      total: somar(lista),
    }))
    .sort((a, b) => b.total - a.total || a.mercado.localeCompare(b.mercado));
}

/**
 * RF-09 "um mercado só": por cobertura e depois por total, comparando o total só sobre os itens
 * que os dois mercados cobrem (quem cobre menos não vence por ser mais barato).
 */
export function montarCestas(itens: readonly ItemDaLista[], max = 3): Cesta[] {
  const cnpjs = new Set(itens.flatMap((i) => [...i.sugestao.porMercado.keys()]));
  const cestas = [...cnpjs].map((cnpj) => {
    const cobertos: ItemNoMercado[] = [];
    const faltando: string[] = [];
    for (const item of itens) {
      const m = noMercado(item, item.sugestao.porMercado.get(cnpj));
      if (m.preco === null) faltando.push(m.descricao);
      else cobertos.push(m);
    }
    return {
      cnpj,
      mercado: nomeDoMercado(itens, cnpj),
      cobertos,
      faltando,
      total: somar(cobertos),
    };
  });
  const totalEm = (c: Cesta, grupos: ReadonlySet<string>) =>
    somar(c.cobertos.filter((i) => grupos.has(i.grupo)));
  return cestas
    .sort((a, b) => {
      if (b.cobertos.length !== a.cobertos.length) return b.cobertos.length - a.cobertos.length;
      const deB = new Set(b.cobertos.map((i) => i.grupo));
      const comuns = new Set(a.cobertos.map((i) => i.grupo).filter((g) => deB.has(g)));
      return totalEm(a, comuns) - totalEm(b, comuns) || a.mercado.localeCompare(b.mercado);
    })
    .slice(0, max);
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

function reais(v: number): string {
  return BRL.format(v).replace(/\s/g, ' ');
}

function diaMes(data: DataIso): string {
  const d = new Date(data);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function qtd(valor: number, unidade: string): string {
  return `${QTD.format(valor)} ${unidade}`;
}

/** RF-13: texto de "Copiar lista" da visão atual. */
export function textoDaLista(visao: VisaoSugestao, itens: readonly ItemDaLista[]): string {
  const linhas = ['Lista de compras · Cupom Esperto', ''];
  if (visao === 'lista') {
    for (const { sugestao: s, quantidade } of itens) {
      const { ultimoPago: u, maisBarato: b, sufixo } = s.faixa;
      let linha =
        `- ${s.descricao} (≈ ${qtd(quantidade, s.quantidade.unidade)}): última vez ` +
        `${reais(u.valor)}${sufixo} no ${u.compra.mercado} em ${diaMes(u.compra.emissao)}`;
      if (b.valor < u.valor - CENTAVO) {
        linha += `; mais barato ${reais(b.valor)}${sufixo} no ${b.compra.mercado}`;
      }
      linhas.push(linha);
    }
    const t = totaisDaLista(itens);
    linhas.push('', `Como da última vez: ${reais(t.comoDaUltimaVez)}`);
    linhas.push(`No seu menor preço: ${reais(t.noMenorPreco)}`);
  } else {
    for (const g of agruparPorMaisBarato(itens)) {
      const n = g.itens.length;
      linhas.push(`${g.mercado}: ${n} ${n === 1 ? 'item' : 'itens'}, ${reais(g.total)}`);
      for (const i of g.itens) {
        const preco = i.subtotal === null ? '' : `: ${reais(i.subtotal)}`;
        linhas.push(`- ${i.descricao} (≈ ${qtd(i.quantidade, i.unidade)})${preco}`);
      }
      linhas.push('');
    }
    linhas.pop();
  }
  return linhas.join('\n');
}
