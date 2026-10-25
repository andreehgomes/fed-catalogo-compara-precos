import { etiquetar, type Etiquetas } from '@shared/etiquetas';
import type { Produto, ProdutoId } from '@shared/model';
import { etiquetasDaIa } from '@shared/nome-produto';
import type { Contexto } from '../importar/contexto';
import { erroIa } from './ia';
import {
  MAX_ITENS_POR_CHAMADA,
  registrarGasto,
  vincularNota,
  type ResumoVinculoNota,
} from './vincular-nota';

/** `vincularNota` divide em no máximo 2 chamadas: mais que isso por vez estouraria a saída da IA. */
export const MAX_PRODUTOS_POR_RODADA = 2 * MAX_ITENS_POR_CHAMADA;

export interface ResumoReprocessamento extends ResumoVinculoNota {
  /** Produtos sem nome que foram para a IA de nome, e quantos voltaram nomeados. */
  semNome: number;
  nomeados: number;
  chamadasNome: number;
  custoNomeUsd: number;
  /** Motivo (`erroIa`) quando a IA de nome falhou no todo ou em parte. */
  erroNome?: string;
  etiquetasPreenchidas: number;
  semVinculo: number;
  lojas: number;
}

/** `loc:{cnpj}:{codigo}`: a loja que criou o produto. */
const lojaDe = (id: ProdutoId) => id.split(':')[1];

/**
 * Retroativo do nome legível e do vínculo automático. Os produtos sem nome (nunca os de nome
 * manual) vão para a IA de nome, que também troca as etiquetas pelas dela; os que continuam sem
 * etiquetas ganham as da regra; e os `loc:` ainda sem vínculo passam pelo mesmo `vincularNota`
 * da importação, loja por loja, como se cada loja tivesse acabado de mandar uma nota com eles.
 */
export async function reprocessarVinculos(
  ctx: Contexto,
  produtos: readonly Produto[],
): Promise<ResumoReprocessamento> {
  const resumo: ResumoReprocessamento = {
    semNome: 0,
    nomeados: 0,
    chamadasNome: 0,
    custoNomeUsd: 0,
    etiquetasPreenchidas: 0,
    semVinculo: 0,
    lojas: 0,
    etiquetas: 0,
    ia: 0,
    ambiguos: 0,
    duvidas: 0,
    chamadasIa: 0,
    custoUsd: 0,
  };

  const daIa = await nomear(ctx, produtos, resumo);
  const porLoja = new Map<string, ProdutoId[]>();
  for (const p of produtos) {
    let bloco = daIa.has(p.id) ? daIa.get(p.id)!.bloco : p.bloco;
    if (!daIa.has(p.id) && (!p.etiquetas || bloco === undefined)) {
      const etiquetas = etiquetar(p.descricao);
      bloco = etiquetas.bloco;
      await ctx.repo.gravar(`produtos/${p.id}`, { etiquetas, bloco }, { merge: true });
      resumo.etiquetasPreenchidas++;
    }
    if (!p.id.startsWith('loc:') || p.vinculadoA || p.vinculoBloqueado || !bloco) continue;
    resumo.semVinculo++;
    const loja = lojaDe(p.id);
    porLoja.set(loja, [...(porLoja.get(loja) ?? []), p.id]);
  }

  resumo.lojas = porLoja.size;
  for (const [cnpj, ids] of [...porLoja].sort(([a], [b]) => a.localeCompare(b))) {
    for (let i = 0; i < ids.length; i += MAX_PRODUTOS_POR_RODADA) {
      const r = await vincularNota(
        ctx,
        { chave: '', cnpj },
        ids.slice(i, i + MAX_PRODUTOS_POR_RODADA),
      );
      resumo.etiquetas += r.etiquetas;
      resumo.ia += r.ia;
      resumo.ambiguos += r.ambiguos;
      resumo.duvidas += r.duvidas;
      resumo.chamadasIa += r.chamadasIa;
      resumo.custoUsd += r.custoUsd;
    }
  }
  return resumo;
}

/** Nome e etiquetas da IA para os produtos sem nome; grava cada um e devolve as etiquetas novas. */
async function nomear(
  ctx: Contexto,
  produtos: readonly Produto[],
  resumo: ResumoReprocessamento,
): Promise<Map<ProdutoId, Etiquetas>> {
  const daIa = new Map<ProdutoId, Etiquetas>();
  const semNome = produtos.filter((p) => !p.nome && p.nomeOrigem !== 'manual');
  resumo.semNome = semNome.length;
  if (!semNome.length) return daIa;
  try {
    const r = await ctx.normalizarNomes(semNome.map((p, k) => ({ i: k + 1, d: p.descricao })));
    resumo.chamadasNome = r.chamadas;
    resumo.custoNomeUsd = r.custoUsd;
    if (r.erro) resumo.erroNome = erroIa(r.erro).erro;
    for (const [i, n] of r.nomes) {
      const p = semNome[i - 1];
      const etiquetas = etiquetasDaIa(n, p.descricao);
      daIa.set(p.id, etiquetas);
      await ctx.repo.gravar(
        `produtos/${p.id}`,
        { nome: n.nome, nomeOrigem: 'ia', etiquetas, bloco: etiquetas.bloco },
        { merge: true },
      );
    }
    resumo.nomeados = daIa.size;
    await registrarGasto(ctx, 'nome', r.custoUsd, r.chamadas);
  } catch (e) {
    resumo.erroNome = erroIa(e).erro;
  }
  return daIa;
}
