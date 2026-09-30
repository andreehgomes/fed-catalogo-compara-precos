import type {
  ComId,
  DataIso,
  ItemLista,
  ItemNota,
  ListaCompras,
  Nota,
  OrigemItemLista,
  Produto,
  UnidadeBase,
  VinculoItemLista,
} from '@shared/model';
import { normalizarDescricao, tokensSemMedida } from '@shared/normalizar';
import { jaccard } from '@shared/similaridade';
import {
  CompraPessoal,
  Grupos,
  chaveDoGrupo,
  consolidarItens,
  conteudoCompativel,
  unidadeNormalizada,
} from '../notas/detalhe/historico-pessoal';
import {
  ItemDaLista,
  QuantidadeSugerida,
  ocasioes,
  precoNaQuantidade,
  quantidadeSugerida,
} from '../sugestoes/sugestao';

export const MAX_LISTAS = 5;
export const MAX_ITENS = 150;
export const MAX_NOTAS_POR_LISTA = 3;
export const MAX_TEXTO = 80;
export const MAX_NOME = 60;
export const MAX_QUANTIDADE = 999;
/**
 * D-04, calibrado com a nota real (`src/testing/fixtures/lista/`): o texto da lista tem 1 ou 2
 * palavras e a descrição da NFC-e 3 ou 4, então um acerto óbvio ("detergente" × "Det Ype 500ml
 * Coco") fica em 1/3. Abaixo de 0,2 só sobram coincidências de uma palavra genérica.
 */
export const LIGA_POR_TEXTO = 1 / 3;
export const PERGUNTA_POR_TEXTO = 0.2;
export const SUGESTOES_AUTOCOMPLETAR = 5;

export type Item = ComId<ItemLista>;
export type Lista = ComId<ListaCompras>;

export interface ItemNovo {
  texto: string;
  grupo: string | null;
  quantidade: number | null;
  unidade: string | null;
  base: UnidadeBase | null;
  origem: OrigemItemLista;
}

export type Mesclagem =
  | {
      tipo: 'somar';
      id: string;
      quantidade: number;
      unidade: string | null;
      base: UnidadeBase | null;
    }
  | { tipo: 'novo' };

export interface Par {
  item: Item;
  nota: ItemNota;
  como: VinculoItemLista['como'];
  score: number;
}

export interface Conciliacao {
  comprados: Par[];
  confirme: Par[];
  faltou: Item[];
  foraDaLista: ItemNota[];
}

export interface ResumoConferencia {
  total: number;
  daLista: number;
  qtdDaLista: number;
  foraDaLista: number;
  qtdForaDaLista: number;
  qtdFaltou: number;
}

export interface PrecoDeReferencia {
  /** Na unidade da quantidade do item. */
  valor: number;
  compra: CompraPessoal;
}

export interface Estimativa {
  total: number;
  comPreco: number;
  semPreco: number;
}

export interface SugestaoAutocompletar {
  grupo: string;
  descricao: string;
  quantidade: QuantidadeSugerida;
}

export type AcaoFinalizacao = 'excluir' | 'guardar' | 'so-faltou';

/** `itemId: null` = o documento da própria lista. */
export type Operacao =
  | { tipo: 'delete'; itemId: string | null }
  | { tipo: 'update'; itemId: string | null; dados: Partial<ItemLista> | Partial<ListaCompras> };

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

export function limparTexto(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO);
}

export function limitarQuantidade(q: number | null | undefined): number | null {
  if (q === null || q === undefined || !Number.isFinite(q) || q <= 0) return null;
  return Math.min(MAX_QUANTIDADE, Math.round(q * 1000) / 1000);
}

export function chaveDoItem(i: Pick<ItemLista, 'grupo' | 'texto'>): string {
  return i.grupo ?? normalizarDescricao(i.texto);
}

function mesmoItem(a: Pick<ItemLista, 'grupo' | 'texto'>, b: Pick<ItemLista, 'grupo' | 'texto'>) {
  if (a.grupo && b.grupo) return a.grupo === b.grupo;
  return normalizarDescricao(a.texto) === normalizarDescricao(b.texto);
}

function mesmaUnidade(a: string | null, b: string | null): boolean {
  return !a || !b || unidadeNormalizada(a) === unidadeNormalizada(b);
}

/**
 * RF-02: o mesmo produto (grupo) ou o mesmo texto normalizado soma a quantidade, desde que na
 * mesma unidade; quantidade em branco conta como 1 quando as duas estão em branco e, senão, vale
 * a que foi informada. Item já ligado a uma nota não recebe soma.
 */
export function mesclarItem(existentes: readonly Item[], novo: ItemNovo): Mesclagem {
  const e = existentes.find(
    (x) =>
      !x.vinculo &&
      mesmoItem(x, novo) &&
      (x.quantidade === null || novo.quantidade === null || mesmaUnidade(x.unidade, novo.unidade)),
  );
  if (!e) return { tipo: 'novo' };
  const [a, b] = [e.quantidade, novo.quantidade];
  const quantidade = a === null && b === null ? 2 : (a ?? 0) + (b ?? 0);
  return {
    tipo: 'somar',
    id: e.id,
    quantidade: limitarQuantidade(quantidade)!,
    unidade: a !== null ? e.unidade : novo.unidade,
    base: a !== null ? e.base : novo.base,
  };
}

export interface Adicao {
  /** Itens existentes que recebem a soma: id → nova quantidade/unidade. */
  somar: Map<string, Pick<ItemLista, 'quantidade' | 'unidade' | 'base'>>;
  novos: ItemLista[];
  /** Itens que não entraram por causa do limite de `MAX_ITENS`. */
  foraDoLimite: number;
}

export function itemDe(novo: ItemNovo, ordem: number): ItemLista {
  const quantidade = limitarQuantidade(novo.quantidade);
  return {
    texto: limparTexto(novo.texto),
    grupo: novo.grupo,
    quantidade,
    unidade: quantidade === null ? null : novo.unidade,
    base: quantidade === null ? null : novo.base,
    origem: novo.origem,
    ordem,
    marcado: false,
    marcadoEm: null,
    vinculo: null,
  };
}

/** Soma o que já está na lista (inclusive repetidos entre os novos) e corta em `MAX_ITENS`. */
export function planejarAdicao(existentes: readonly Item[], novos: readonly ItemNovo[]): Adicao {
  const atuais: Item[] = [...existentes];
  const criados = new Map<string, ItemLista>();
  const somar: Adicao['somar'] = new Map();
  let ordem = Math.max(0, ...existentes.map((i) => i.ordem));
  let foraDoLimite = 0;
  novos.forEach((n, k) => {
    const m = mesclarItem(atuais, n);
    if (m.tipo === 'somar') {
      const dados = { quantidade: m.quantidade, unidade: m.unidade, base: m.base };
      const i = atuais.findIndex((x) => x.id === m.id);
      atuais[i] = { ...atuais[i], ...dados };
      if (criados.has(m.id)) criados.set(m.id, { ...criados.get(m.id)!, ...dados });
      else somar.set(m.id, dados);
      return;
    }
    if (atuais.length >= MAX_ITENS) {
      foraDoLimite++;
      return;
    }
    const item = itemDe(n, ++ordem);
    const id = `novo:${k}`;
    criados.set(id, item);
    atuais.push({ id, ...item });
  });
  return { somar, novos: [...criados.values()], foraDoLimite };
}

export function itensDaSugestao(selecionados: readonly ItemDaLista[]): ItemNovo[] {
  return selecionados.map(({ sugestao: s, quantidade }) => ({
    texto: limparTexto(s.descricao),
    grupo: s.grupo,
    quantidade: limitarQuantidade(quantidade),
    unidade: s.quantidade.unidade,
    base: s.quantidade.base,
    origem: 'sugestao',
  }));
}

export function itemDoProduto(produto: Pick<Produto, 'id' | 'descricao' | 'vinculadoA'>): ItemNovo {
  return {
    texto: limparTexto(produto.descricao),
    grupo: produto.vinculadoA ?? produto.id,
    quantidade: null,
    unidade: null,
    base: null,
    origem: 'produto',
  };
}

/** `compras` da mais recente para a mais antiga, como no índice do histórico. */
export function itemDoHistorico(grupo: string, compras: readonly CompraPessoal[]): ItemNovo {
  const q = quantidadeSugerida(ocasioes(compras));
  return {
    texto: limparTexto(compras[0].descricao),
    grupo,
    quantidade: limitarQuantidade(q.valor),
    unidade: q.unidade,
    base: q.base,
    origem: 'historico',
  };
}

export function itemDaNota(item: ItemNota, grupo: string): ItemNovo {
  return {
    texto: limparTexto(item.descricao),
    grupo,
    quantidade: limitarQuantidade(item.qtd),
    unidade: unidadeNormalizada(item.unidade).slice(0, 10) || null,
    base: null,
    origem: 'nota',
  };
}

function diaMes(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nomePadrao(hoje: Date): string {
  return `Compras de ${diaMes(hoje)}`;
}

export function separar(itens: readonly Item[]): { pendentes: Item[]; noCarrinho: Item[] } {
  return {
    pendentes: itens.filter((i) => !i.marcado).sort((a, b) => a.ordem - b.ordem),
    noCarrinho: itens
      .filter((i) => i.marcado)
      .sort((a, b) => (b.marcadoEm ?? '').localeCompare(a.marcadoEm ?? '') || a.ordem - b.ordem),
  };
}

export function progresso(itens: readonly Item[]): { marcados: number; total: number } {
  return { marcados: itens.filter((i) => i.marcado).length, total: itens.length };
}

/**
 * Contadores do cabeçalho a partir dos itens, gravados no mesmo batch do item. Absolutos (e não
 * `increment`) para se corrigirem sozinhos: a regra recusa `qtdMarcados > qtdItens`, e um
 * contador que divergisse travaria a lista.
 */
export function contadores(itens: readonly Pick<ItemLista, 'marcado'>[]) {
  return { qtdItens: itens.length, qtdMarcados: itens.filter((i) => i.marcado).length };
}

/** A compra da lista já foi conferida com uma nota e ainda não foi finalizada (RF-13). */
export function compraConferida(lista: ListaCompras, itens: readonly Item[]): boolean {
  return lista.notas.length > 0 || (itens.length > 0 && itens.every((i) => !!i.vinculo));
}

function precoUnitario(item: ItemLista, compra: CompraPessoal): number | null {
  if (item.base)
    return precoNaQuantidade({ valor: 0, unidade: item.base, base: item.base }, compra);
  if (item.unidade) {
    return precoNaQuantidade(
      { valor: 0, unidade: unidadeNormalizada(item.unidade), base: null },
      compra,
    );
  }
  return compra.vlUnit;
}

/** RF-05: última compra do grupo, no preço da unidade da quantidade do item. */
export function precoDeReferencia(
  item: ItemLista,
  indice: ReadonlyMap<string, readonly CompraPessoal[]>,
): PrecoDeReferencia | null {
  const compra = item.grupo ? indice.get(item.grupo)?.[0] : undefined;
  if (!compra) return null;
  const valor = precoUnitario(item, compra);
  return valor === null ? null : { valor, compra };
}

export function estimativa(
  itens: readonly ItemLista[],
  indice: ReadonlyMap<string, readonly CompraPessoal[]>,
): Estimativa {
  let total = 0;
  let comPreco = 0;
  for (const item of itens) {
    const p = precoDeReferencia(item, indice);
    if (!p) continue;
    total += p.valor * (item.quantidade ?? 1);
    comPreco++;
  }
  return { total: centavos(total), comPreco, semPreco: itens.length - comPreco };
}

const QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** "6 un", "1,5 kg", "2 PCT"… ou vazio sem quantidade. */
export function rotuloQuantidade(item: Pick<ItemLista, 'quantidade' | 'unidade'>): string {
  if (item.quantidade === null) return '';
  const un = item.unidade ?? '';
  const unidade = ['kg', 'L'].includes(un) ? un : un.toLowerCase();
  return `${QTD.format(item.quantidade)} ${unidade}`.trim();
}

/** RF-18: texto de "Copiar lista"/"Compartilhar", só com o que falta pegar. */
export function textoDaLista(lista: Pick<ListaCompras, 'nome'>, itens: readonly Item[]): string {
  const linhas = [`${lista.nome} · Cupom Esperto`, ''];
  for (const i of separar(itens).pendentes) {
    const q = rotuloQuantidade(i);
    linhas.push(`- ${i.texto}${q ? ` (${q})` : ''}`);
  }
  return linhas.join('\n');
}

/**
 * Jaccard em que a palavra digitada casa com a da descrição pelo começo ("leit" → LEITE),
 * para o autocompletar funcionar enquanto o usuário digita.
 */
function semelhancaPorPrefixo(digitados: readonly string[], descricao: readonly string[]) {
  const comuns = digitados.filter((t) => descricao.some((d) => d.startsWith(t))).length;
  return comuns / (digitados.length + descricao.length - comuns);
}

/** RF-02: o que o usuário já comprou, pela descrição mais recente de cada grupo. */
export function autocompletar(
  texto: string,
  indice: ReadonlyMap<string, readonly CompraPessoal[]>,
): SugestaoAutocompletar[] {
  const digitados = tokensSemMedida(texto);
  if (texto.trim().length < 2 || !digitados.length) return [];
  const achados: { grupo: string; compras: readonly CompraPessoal[]; score: number }[] = [];
  for (const [grupo, compras] of indice) {
    if (!compras.length) continue;
    const score = semelhancaPorPrefixo(digitados, tokensSemMedida(compras[0].descricao));
    if (score > 0) achados.push({ grupo, compras, score });
  }
  return achados
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.compras.length - a.compras.length ||
        a.compras[0].descricao.localeCompare(b.compras[0].descricao),
    )
    .slice(0, SUGESTOES_AUTOCOMPLETAR)
    .map(({ grupo, compras }) => ({
      grupo,
      descricao: compras[0].descricao,
      quantidade: quantidadeSugerida(ocasioes(compras)),
    }));
}

export function scoreDeTexto(texto: string, descricao: string): number {
  return jaccard(tokensSemMedida(texto), tokensSemMedida(descricao));
}

/**
 * RF-10. Só itens da lista ainda sem vínculo (a segunda nota não mexe no que a primeira ligou).
 * 1) Pelo grupo do produto, o item da nota de maior valor. 2) Por texto, melhor par primeiro,
 * cada lado uma vez; liga sozinho só com score ≥ `LIGA_POR_TEXTO` e um candidato só, senão
 * pergunta. 3) O resto da lista faltou; o resto da nota veio fora da lista.
 */
export function conciliar(itens: readonly Item[], nota: Nota, grupos: Grupos): Conciliacao {
  const daNota = consolidarItens(nota.itens);
  const usados = new Set<number>();
  const comprados: Par[] = [];
  const confirme: Par[] = [];
  const restantes: Item[] = [];

  for (const item of [...itens].filter((i) => !i.vinculo).sort((a, b) => a.ordem - b.ordem)) {
    const grupo = item.grupo ? chaveDoGrupo(item.grupo, grupos) : null;
    const achado = grupo
      ? daNota
          .filter((n) => !usados.has(n.n) && chaveDoGrupo(n.produtoId, grupos) === grupo)
          .sort((a, b) => b.vlTotal - a.vlTotal)[0]
      : undefined;
    if (achado) {
      usados.add(achado.n);
      comprados.push({ item, nota: achado, como: 'grupo', score: 1 });
    } else {
      restantes.push(item);
    }
  }

  const livres = daNota.filter((n) => !usados.has(n.n));
  const pares: Par[] = [];
  const candidatos = new Map<string, number>();
  for (const item of restantes) {
    for (const n of livres) {
      if (!conteudoCompativel(item.texto, n.descricao)) continue;
      const score = scoreDeTexto(item.texto, n.descricao);
      if (score < PERGUNTA_POR_TEXTO) continue;
      pares.push({ item, nota: n, como: 'texto', score });
      candidatos.set(item.id, (candidatos.get(item.id) ?? 0) + 1);
    }
  }
  pares.sort(
    (a, b) => b.score - a.score || b.nota.vlTotal - a.nota.vlTotal || a.item.ordem - b.item.ordem,
  );
  const ligados = new Set<string>();
  for (const par of pares) {
    if (ligados.has(par.item.id) || usados.has(par.nota.n)) continue;
    ligados.add(par.item.id);
    usados.add(par.nota.n);
    const certo = par.score >= LIGA_POR_TEXTO - 1e-9 && candidatos.get(par.item.id) === 1;
    (certo ? comprados : confirme).push(par);
  }

  const porOrdem = (a: Par, b: Par) => a.item.ordem - b.item.ordem;
  return {
    comprados: comprados.sort(porOrdem),
    confirme: confirme.sort(porOrdem),
    faltou: restantes.filter((i) => !ligados.has(i.id)),
    foraDaLista: daNota.filter((n) => !usados.has(n.n)).sort((a, b) => b.vlTotal - a.vlTotal),
  };
}

/** Conciliação com os ajustes do usuário; `adicionados` são itens de fora que viram item da lista. */
export interface Ajustes extends Conciliacao {
  adicionados: ItemNota[];
}

function porValor(a: ItemNota, b: ItemNota): number {
  return b.vlTotal - a.vlTotal;
}

function porOrdemDoItem(a: Item, b: Item): number {
  return a.ordem - b.ordem;
}

export function comAjustes(c: Conciliacao): Ajustes {
  return { ...c, adicionados: [] };
}

/** "Sim" num par de "Confirme". */
export function confirmarPar(c: Ajustes, itemId: string): Ajustes {
  const par = c.confirme.find((p) => p.item.id === itemId);
  if (!par) return c;
  return {
    ...c,
    confirme: c.confirme.filter((p) => p !== par),
    comprados: [...c.comprados, par].sort((a, b) => porOrdemDoItem(a.item, b.item)),
  };
}

/** "Não" em "Confirme" ou "Não é este" em "Comprados": o item faltou e o da nota veio fora. */
export function desfazerPar(c: Ajustes, itemId: string): Ajustes {
  const par = [...c.comprados, ...c.confirme].find((p) => p.item.id === itemId);
  if (!par) return c;
  return {
    ...c,
    comprados: c.comprados.filter((p) => p !== par),
    confirme: c.confirme.filter((p) => p !== par),
    faltou: [...c.faltou, par.item].sort(porOrdemDoItem),
    foraDaLista: [...c.foraDaLista, par.nota].sort(porValor),
  };
}

/** "Estava na nota como…" / "Estava na lista como…". */
export function ligarManual(c: Ajustes, itemId: string, n: number): Ajustes {
  const item = c.faltou.find((i) => i.id === itemId);
  const nota = c.foraDaLista.find((i) => i.n === n);
  if (!item || !nota) return c;
  return {
    ...c,
    faltou: c.faltou.filter((i) => i !== item),
    foraDaLista: c.foraDaLista.filter((i) => i !== nota),
    comprados: [...c.comprados, { item, nota, como: 'manual' as const, score: 1 }].sort((a, b) =>
      porOrdemDoItem(a.item, b.item),
    ),
  };
}

/** "Adicionar à lista" num item de fora; chamar de novo devolve o item para "Fora da lista". */
export function alternarAdicionado(c: Ajustes, n: number): Ajustes {
  const adicionado = c.adicionados.find((i) => i.n === n);
  if (adicionado) {
    return {
      ...c,
      adicionados: c.adicionados.filter((i) => i !== adicionado),
      foraDaLista: [...c.foraDaLista, adicionado].sort(porValor),
    };
  }
  const nota = c.foraDaLista.find((i) => i.n === n);
  if (!nota) return c;
  return {
    ...c,
    foraDaLista: c.foraDaLista.filter((i) => i !== nota),
    adicionados: [...c.adicionados, nota],
  };
}

/**
 * Os pares a confirmar ainda não contam como da lista; os itens de fora que o usuário acrescentou
 * à lista (`adicionados`, já tirados de `foraDaLista`) contam.
 */
export function resumoDaConferencia(
  c: Conciliacao,
  nota: Pick<Nota, 'total'>,
  adicionados: readonly ItemNota[] = [],
): ResumoConferencia {
  const soma = (xs: readonly ItemNota[]) => centavos(xs.reduce((s, x) => s + x.vlTotal, 0));
  const fora = [...c.foraDaLista, ...c.confirme.map((p) => p.nota)];
  const daLista = [...c.comprados.map((p) => p.nota), ...adicionados];
  return {
    total: nota.total,
    daLista: soma(daLista),
    qtdDaLista: daLista.length,
    foraDaLista: soma(fora),
    qtdForaDaLista: fora.length,
    qtdFaltou: c.faltou.length,
  };
}

export function vinculoDe(
  par: Pick<Par, 'nota' | 'como'>,
  nota: Pick<Nota, 'chave' | 'cnpj' | 'estabelecimentoNome'>,
): VinculoItemLista {
  return {
    chave: nota.chave,
    n: par.nota.n,
    produtoId: par.nota.produtoId,
    descricao: par.nota.descricao.slice(0, 200),
    qtd: par.nota.qtd,
    unidade: par.nota.unidade.slice(0, 10),
    vlTotal: par.nota.vlTotal,
    cnpj: nota.cnpj,
    mercado: nota.estabelecimentoNome.slice(0, 120),
    como: par.como,
  };
}

/** A lista aprende o produto: item digitado que ganhou par passa a ter o grupo do item da nota. */
export function gruposAprendidos(pares: readonly Par[], grupos: Grupos): Map<string, string> {
  return new Map(
    pares
      .filter((p) => !p.item.grupo)
      .map((p) => [p.item.id, chaveDoGrupo(p.nota.produtoId, grupos)]),
  );
}

/** Itens que não foram comprados: sem vínculo com nota e fora do carrinho. */
export function faltantes(itens: readonly Item[]): Item[] {
  return itens.filter((i) => !i.vinculo && !i.marcado);
}

/** RF-13: "Ler outra nota" só com algo faltando e menos de `MAX_NOTAS_POR_LISTA` notas. */
export function podeLerOutraNota(lista: ListaCompras, itens: readonly Item[]): boolean {
  return lista.notas.length < MAX_NOTAS_POR_LISTA && faltantes(itens).length > 0;
}

/** RF-13, sem SDK: o service aplica as operações num `writeBatch`. */
export function planoDeFinalizacao(
  acao: AcaoFinalizacao,
  lista: ListaCompras,
  itens: readonly Item[],
  agora: DataIso,
): Operacao[] {
  const cabecalho = {
    status: 'aberta' as const,
    notas: [],
    pendentes: [],
    qtdMarcados: 0,
    atualizadaEm: agora,
  };
  switch (acao) {
    case 'excluir':
      return [
        ...itens.map((i) => ({ tipo: 'delete' as const, itemId: i.id })),
        { tipo: 'delete', itemId: null },
      ];
    case 'guardar':
      return [
        ...itens.map((i) => ({
          tipo: 'update' as const,
          itemId: i.id,
          dados: { marcado: false, marcadoEm: null, vinculo: null },
        })),
        { tipo: 'update', itemId: null, dados: { ...cabecalho, ultimaCompraEm: agora } },
      ];
    case 'so-faltou': {
      const faltou = faltantes(itens);
      if (!faltou.length) throw new Error('Nenhum item faltou');
      return [
        ...itens
          .filter((i) => i.vinculo || i.marcado)
          .map((i) => ({ tipo: 'delete' as const, itemId: i.id })),
        {
          tipo: 'update',
          itemId: null,
          dados: { ...cabecalho, qtdItens: faltou.length, ultimaCompraEm: lista.ultimaCompraEm },
        },
      ];
    }
  }
}
