import { etiquetar } from '@shared/etiquetas';
import type { Produto, ProdutoId } from '@shared/model';
import type { Contexto } from '../importar/contexto';
import { MAX_ITENS_POR_CHAMADA, vincularNota, type ResumoVinculoNota } from './vincular-nota';

/** `vincularNota` divide em no máximo 2 chamadas: mais que isso por vez estouraria a saída da IA. */
export const MAX_PRODUTOS_POR_RODADA = 2 * MAX_ITENS_POR_CHAMADA;

export interface ResumoReprocessamento extends ResumoVinculoNota {
  etiquetasPreenchidas: number;
  semVinculo: number;
  lojas: number;
}

/** `loc:{cnpj}:{codigo}`: a loja que criou o produto. */
const lojaDe = (id: ProdutoId) => id.split(':')[1];

/**
 * Retroativo do vínculo automático: os produtos importados antes das etiquetas ganham
 * `etiquetas`/`bloco`, e os `loc:` ainda sem vínculo passam pelo mesmo `vincularNota` da
 * importação, loja por loja, como se cada loja tivesse acabado de mandar uma nota com eles.
 */
export async function reprocessarVinculos(
  ctx: Contexto,
  produtos: readonly Produto[],
): Promise<ResumoReprocessamento> {
  const resumo: ResumoReprocessamento = {
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

  const porLoja = new Map<string, ProdutoId[]>();
  for (const p of produtos) {
    let bloco = p.bloco;
    if (!p.etiquetas || bloco === undefined) {
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
