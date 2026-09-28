import { normalizarGtin } from './gtin';
import type { SugestaoEan } from './model';
import { tokensSemMedida } from './normalizar';
import { descricaoDominante, mesmoEstabelecimento } from './similaridade';
import { extrairConteudo } from './unidade';

export interface OfertaComGtin {
  descricao: string;
  gtin: string | null;
  valor: number;
  estabelecimento: { razaoSocial: string; logradouro: string; municipio: string };
}

export interface ItemParaVincular {
  descricao: string;
  vlUnit: number;
  loja: { razaoSocial: string; logradouro: string; municipio: string };
}

export type DecisaoGtin =
  | { tipo: 'vincular'; gtin: string; descricao: string; motivo: 'mesma-loja' | 'consenso' }
  | { tipo: 'ambiguo'; candidatos: SugestaoEan[] }
  | { tipo: 'sem-resultado' };

export const MIN_LOJAS_CONSENSO = 2;
export const MAX_SUGESTOES = 3;

/**
 * Cada token nosso precisa aparecer do outro lado, inteiro ou como prefixo: a NFC-e corta
 * a descrição em 20 caracteres e abrevia ("Req", "Des", "Beb"), o Menor Preço não.
 */
export function tokensContidos(nossos: readonly string[], deles: readonly string[]): boolean {
  return nossos.length > 0 && nossos.every((t) => deles.some((d) => d.startsWith(t)));
}

/**
 * A busca do Menor Preço exige palavras inteiras, e a NFC-e corta e abrevia. O primeiro
 * termo leva todas as palavras; se não vier nada, o segundo só as duas mais longas.
 */
export function termosDeBusca(descricao: string): string[] {
  const palavras = tokensSemMedida(descricao).filter((t) => t.length >= 3);
  const longas = [...palavras].sort((a, b) => b.length - a.length).slice(0, 2);
  const termos = [palavras, palavras.filter((t) => longas.includes(t))]
    .map((ts) => ts.join(' ').toLowerCase())
    .filter(Boolean);
  return [...new Set(termos)];
}

function mesmoConteudo(a: string, b: string): boolean {
  const ca = extrairConteudo(a);
  const cb = extrairConteudo(b);
  if (!ca || !cb) return true;
  return ca.unidadeBase === cb.unidadeBase && Math.abs(ca.quantidade - cb.quantidade) < 1e-6;
}

/** "ST" abrevia "SANTO": mesma inicial e as letras na ordem. */
function abrevia(curto: string, longo: string): boolean {
  if (curto[0] !== longo[0]) return false;
  let i = 0;
  for (const c of longo) if (c === curto[i]) i++;
  return i === curto.length;
}

export function municipioIgual(a: string, b: string): boolean {
  const [ta, tb] = [tokensSemMedida(a), tokensSemMedida(b)];
  const [curto, longo] = ta.join('').length <= tb.join('').length ? [ta, tb] : [tb, ta];
  return curto.length === longo.length && curto.every((t, i) => abrevia(t, longo[i]));
}

function chaveLoja(o: OfertaComGtin): string {
  return `${o.estabelecimento.razaoSocial}|${o.estabelecimento.logradouro}`.toUpperCase();
}

/**
 * Descobre o GTIN de um item sem EAN pelas ofertas do Menor Preço. Só vincula com
 * segurança: a mesma loja vendendo pelo mesmo preço, ou um único GTIN visto em
 * `MIN_LOJAS_CONSENSO` lojas. Mais de um GTIN possível vira sugestão.
 */
export function decidirGtin(
  item: ItemParaVincular,
  ofertas: readonly OfertaComGtin[],
): DecisaoGtin {
  const nossos = tokensSemMedida(item.descricao);
  const candidatas = ofertas
    .map((o) => ({ ...o, gtin: normalizarGtin(o.gtin) }))
    .filter(
      (o): o is OfertaComGtin & { gtin: string } =>
        o.gtin !== null &&
        mesmoConteudo(item.descricao, o.descricao) &&
        tokensContidos(nossos, tokensSemMedida(o.descricao)),
    );
  if (candidatas.length === 0) return { tipo: 'sem-resultado' };

  const daLoja = candidatas.filter(
    (o) =>
      Math.abs(o.valor - item.vlUnit) < 0.005 &&
      municipioIgual(o.estabelecimento.municipio, item.loja.municipio) &&
      mesmoEstabelecimento(
        { nome: o.estabelecimento.razaoSocial, logradouro: o.estabelecimento.logradouro },
        { nome: item.loja.razaoSocial, logradouro: item.loja.logradouro },
      ),
  );
  const gtinsDaLoja = new Set(daLoja.map((o) => o.gtin));
  if (gtinsDaLoja.size === 1) {
    const gtin = daLoja[0].gtin;
    return { tipo: 'vincular', gtin, descricao: daLoja[0].descricao, motivo: 'mesma-loja' };
  }

  const porGtin = new Map<string, { lojas: Set<string>; descricoes: string[] }>();
  for (const o of candidatas) {
    const g = porGtin.get(o.gtin) ?? { lojas: new Set<string>(), descricoes: [] };
    g.lojas.add(chaveLoja(o));
    g.descricoes.push(o.descricao);
    porGtin.set(o.gtin, g);
  }
  const grupos = [...porGtin].map(([gtin, g]) => ({
    gtin,
    descricao: descricaoMaisComum(g.descricoes),
    lojas: g.lojas.size,
  }));

  if (grupos.length === 1 && grupos[0].lojas >= MIN_LOJAS_CONSENSO) {
    const { gtin, descricao } = grupos[0];
    return { tipo: 'vincular', gtin, descricao, motivo: 'consenso' };
  }
  return {
    tipo: 'ambiguo',
    candidatos: grupos
      .sort((a, b) => b.lojas - a.lojas || a.gtin.localeCompare(b.gtin))
      .slice(0, MAX_SUGESTOES),
  };
}

function descricaoMaisComum(descricoes: readonly string[]): string {
  const dominante = new Set(descricaoDominante(descricoes));
  const pontos = (d: string) => tokensSemMedida(d).filter((t) => dominante.has(t)).length;
  return [...descricoes].sort((a, b) => pontos(b) - pontos(a) || b.length - a.length)[0];
}
