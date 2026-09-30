import { nomeExibido } from '@shared/apelido';
import type { Estabelecimento, FontePreco, UnidadeBase } from '@shared/model';
import type { PrecoComId } from '../data-access/produtos.service';

export interface LinhaEstabelecimento {
  cnpj: string;
  nome: string;
  valor: number;
  valorUnidadeBase: number | null;
  emissao: string;
  diferenca: number;
  fonte: FontePreco;
}

export interface Observacao {
  id: string;
  cnpj: string;
  nome: string;
  emissao: string;
  valor: number;
  fonte: FontePreco;
}

export interface SeriePreco {
  nome: string;
  pontos: { data: string; valor: number }[];
}

export interface ResumoPrecos {
  unidade: UnidadeBase | null;
  menor: number;
  medio: number;
  maior: number;
  porEstabelecimento: LinhaEstabelecimento[];
  series: SeriePreco[];
  /** Todas as observações, da mais recente para a mais antiga. */
  observacoes: Observacao[];
}

const arredondar = (n: number) => Math.round(n * 100) / 100;

/**
 * RF-15/RF-19: compara pelo preço do item; o preço por unidade base só acompanha a linha
 * quando todas as observações o têm na mesma unidade. Menor/médio/maior cobrem todas as
 * observações da janela; a comparação entre estabelecimentos usa o último preço de cada um.
 */
export function resumirPrecos(
  precos: readonly PrecoComId[],
  estabelecimentos: ReadonlyMap<string, Estabelecimento>,
  chavesDoUsuario: ReadonlySet<string> = new Set(),
  apelidos?: ReadonlyMap<string, string>,
): ResumoPrecos | null {
  if (!precos.length) return null;
  const unidades = new Set(precos.map((p) => p.precoPorUnidadeBase?.unidade ?? null));
  const unidade = unidades.size === 1 ? [...unidades][0] : null;
  const valor = (p: PrecoComId) => p.vlUnit;
  const nome = (cnpj: string) => {
    const e = estabelecimentos.get(cnpj);
    const apelido = apelidos?.get(cnpj);
    return (e ? nomeExibido(e, apelido) : apelido) || cnpj;
  };

  const fonte = (p: PrecoComId): FontePreco =>
    chavesDoUsuario.has(p.chave) ? 'minhas-notas' : 'comunidade';
  const ordenados = [...precos].sort((a, b) => b.emissao.localeCompare(a.emissao));
  const ultimos = new Map<string, PrecoComId>();
  for (const p of ordenados) if (!ultimos.has(p.cnpj)) ultimos.set(p.cnpj, p);
  const valores = precos.map(valor);
  const menorAtual = Math.min(...[...ultimos.values()].map(valor));

  const porEstabelecimento = [...ultimos.values()]
    .map((p) => ({
      cnpj: p.cnpj,
      nome: nome(p.cnpj),
      valor: arredondar(valor(p)),
      valorUnidadeBase: unidade ? arredondar(p.precoPorUnidadeBase!.valor) : null,
      emissao: p.emissao,
      diferenca: arredondar(valor(p) - menorAtual),
      fonte: fonte(p),
    }))
    .sort((a, b) => a.valor - b.valor || a.nome.localeCompare(b.nome));

  const porCnpj = new Map<string, { data: string; valor: number }[]>();
  for (const p of [...precos].sort((a, b) => a.emissao.localeCompare(b.emissao))) {
    const lista = porCnpj.get(p.cnpj) ?? [];
    lista.push({ data: p.emissao, valor: arredondar(valor(p)) });
    porCnpj.set(p.cnpj, lista);
  }

  return {
    unidade,
    menor: arredondar(Math.min(...valores)),
    medio: arredondar(valores.reduce((s, v) => s + v, 0) / valores.length),
    maior: arredondar(Math.max(...valores)),
    porEstabelecimento,
    series: [...porCnpj].map(([cnpj, pontos]) => ({ nome: nome(cnpj), pontos })),
    observacoes: ordenados.map((p) => ({
      id: p.id,
      cnpj: p.cnpj,
      nome: nome(p.cnpj),
      emissao: p.emissao,
      valor: arredondar(valor(p)),
      fonte: fonte(p),
    })),
  };
}

export const MAX_SERIES = 5;

/** Até 5 séries (as com mais pontos); o resto vira "Outros", com o menor valor de cada data. */
export function limitarSeries(series: readonly SeriePreco[], max = MAX_SERIES): SeriePreco[] {
  if (series.length <= max) return [...series];
  const ordenadas = [...series].sort((a, b) => b.pontos.length - a.pontos.length);
  const principais = ordenadas.slice(0, max - 1);
  const porData = new Map<string, number>();
  for (const s of ordenadas.slice(max - 1)) {
    for (const p of s.pontos)
      porData.set(p.data, Math.min(porData.get(p.data) ?? Infinity, p.valor));
  }
  const outros = [...porData]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, valor]) => ({ data, valor }));
  return [...principais, { nome: 'Outros', pontos: outros }];
}
