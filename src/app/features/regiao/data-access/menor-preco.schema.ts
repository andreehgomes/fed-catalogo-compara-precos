import * as v from 'valibot';
import type { Categoria, OfertaRegiao, ResultadoBusca } from './regiao.model';

const numero = v.pipe(
  v.union([v.string(), v.number()]),
  v.transform((x) => (typeof x === 'string' ? Number(x.replace(',', '.')) : x)),
  v.check((n) => Number.isFinite(n), 'número inválido'),
);

const texto = v.optional(v.nullable(v.string()), '');

export const ItemSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  desc: v.pipe(v.string(), v.minLength(1)),
  gtin: texto,
  valor: numero,
  valor_tabela: v.optional(numero),
  valor_desconto: v.optional(numero),
  datahora: v.pipe(
    v.string(),
    v.check((s) => !Number.isNaN(Date.parse(s)), 'data inválida'),
  ),
  distkm: numero,
  estabelecimento: v.object({
    nm_fan: texto,
    nm_emp: v.pipe(v.string(), v.minLength(1)),
    tp_logr: texto,
    nm_logr: texto,
    nr_logr: texto,
    bairro: texto,
    mun: texto,
  }),
});

const RespostaProdutosSchema = v.object({
  total: v.optional(numero, 0),
  precos: v.optional(v.object({ min: v.optional(v.unknown()), max: v.optional(v.unknown()) })),
  produtos: v.array(v.unknown()),
});

const RespostaCategoriasSchema = v.object({
  categorias: v.array(v.object({ id: numero, desc: v.string(), qtd: v.optional(numero, 0) })),
});

export class FormatoInvalidoError extends Error {}

function limpar(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function numeroOuNulo(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : Number(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function mapearItem(item: v.InferOutput<typeof ItemSchema>): OfertaRegiao {
  const e = item.estabelecimento;
  const numeroLogr = limpar(e.nr_logr).replace(/[^0-9A-Za-z]+$/, '');
  const logradouro = [limpar(e.tp_logr), limpar(e.nm_logr)].filter(Boolean).join(' ');
  const valorTabela = item.valor_tabela ?? item.valor;
  return {
    id: item.id,
    descricao: limpar(item.desc),
    gtin: limpar(item.gtin) || null,
    valor: item.valor,
    valorTabela,
    desconto: item.valor_desconto ?? Math.max(0, valorTabela - item.valor),
    dataHora: new Date(item.datahora),
    distanciaKm: item.distkm,
    estabelecimento: {
      nome: limpar(e.nm_fan) || limpar(e.nm_emp),
      razaoSocial: limpar(e.nm_emp),
      endereco: numeroLogr ? `${logradouro}, ${numeroLogr}` : logradouro,
      bairro: limpar(e.bairro),
      municipio: limpar(e.mun),
    },
  };
}

export function mapearProdutos(json: unknown): ResultadoBusca {
  const resposta = v.safeParse(RespostaProdutosSchema, json);
  if (!resposta.success) throw new FormatoInvalidoError('Resposta sem produtos');
  const ofertas: OfertaRegiao[] = [];
  let descartados = 0;
  for (const bruto of resposta.output.produtos) {
    const item = v.safeParse(ItemSchema, bruto);
    if (item.success) ofertas.push(mapearItem(item.output));
    else descartados++;
  }
  const valores = ofertas.map((o) => o.valor);
  return {
    total: resposta.output.total,
    min:
      numeroOuNulo(resposta.output.precos?.min) ?? (valores.length ? Math.min(...valores) : null),
    max:
      numeroOuNulo(resposta.output.precos?.max) ?? (valores.length ? Math.max(...valores) : null),
    ofertas,
    descartados,
  };
}

export function mapearCategorias(json: unknown): Categoria[] {
  const resposta = v.safeParse(RespostaCategoriasSchema, json);
  if (!resposta.success) throw new FormatoInvalidoError('Resposta sem categorias');
  return resposta.output.categorias.map((c) => ({ id: c.id, desc: limpar(c.desc), qtd: c.qtd }));
}
