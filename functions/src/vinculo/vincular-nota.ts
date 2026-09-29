import { decidirPorEtiquetas, etiquetar, type Candidato } from '@shared/etiquetas';
import type { Nota, Produto, ProdutoId } from '@shared/model';
import type { Contexto } from '../importar/contexto';
import { vincular } from '../produtos/vincular-produto';
import { IA_TETO_MENSAL_USD } from './config-ia';
import { IaSemDecisaoError, type ItemIa, type RespostaIa } from './ia';

export const MAX_ITENS_POR_CHAMADA = 40;
export const MAX_CANDIDATOS_VINCULO = 3;

interface DocGastoIa {
  custoUsd: number;
  chamadas: number;
}

export interface ResumoVinculoNota {
  etiquetas: number;
  ia: number;
  ambiguos: number;
  duvidas: number;
  chamadasIa: number;
  custoUsd: number;
}

export const caminhoGastoIa = (agora: Date) => `controle/iaVinculo_${agora.toISOString().slice(0, 7)}`;

/** Raízes do mesmo bloco já vistas em outro mercado (produto só desta loja não conta). */
async function candidatosDe(ctx: Contexto, novo: Produto, cnpj: string): Promise<Produto[]> {
  const raizes = await ctx.repo.consultar<Produto>('produtos', [
    { campo: 'bloco', op: '==', valor: novo.bloco },
    { campo: 'vinculadoA', op: '==', valor: null },
  ]);
  return raizes
    .map((r) => r.dados)
    .filter((p) => p.id !== novo.id && (p.cnpjs ?? []).some((c) => c !== cnpj));
}

function comoCandidato(p: Produto): Candidato {
  const { tipo, variantes } = p.etiquetas ?? etiquetar(p.descricao);
  return { id: p.id, descricao: p.descricao, tipo, variantes };
}

/** Parte em até 2 chamadas em paralelo: nota grande não pode estourar a saída da IA. */
function lotes(itens: ItemIa[]): ItemIa[][] {
  if (itens.length <= MAX_ITENS_POR_CHAMADA) return [itens];
  const meio = Math.ceil(itens.length / 2);
  return [itens.slice(0, meio), itens.slice(meio)];
}

async function registrarGasto(ctx: Contexto, custoUsd: number, chamadas: number): Promise<void> {
  const caminho = caminhoGastoIa(ctx.agora());
  await ctx.repo.transacao(async (tx) => {
    const atual = await tx.obter<DocGastoIa>(caminho);
    tx.gravar(caminho, {
      custoUsd: (atual?.custoUsd ?? 0) + custoUsd,
      chamadas: (atual?.chamadas ?? 0) + chamadas,
    });
  });
}

/**
 * Liga os produtos `loc:` criados por esta nota a produtos de outros mercados: primeiro a
 * regra das etiquetas (grátis), depois uma chamada à IA com as dúvidas, se o teto do mês
 * permitir. Nunca lança: qualquer falha só deixa itens sem vínculo.
 */
export async function vincularNota(
  ctx: Contexto,
  nota: Nota,
  idsNovos: readonly ProdutoId[],
): Promise<ResumoVinculoNota> {
  const inicio = Date.now();
  const resumo: ResumoVinculoNota = {
    etiquetas: 0,
    ia: 0,
    ambiguos: 0,
    duvidas: 0,
    chamadasIa: 0,
    custoUsd: 0,
  };
  const log = (resultado: 'sucesso' | 'falha', erro?: string) =>
    ctx.log({
      etapa: 'vinculo',
      uf: 'PR',
      duracaoMs: Date.now() - inicio,
      resultado,
      chave: nota.chave,
      ...(erro ? { erro } : {}),
      contagens: { ...resumo },
    });

  try {
    const locais = idsNovos.filter((id) => id.startsWith('loc:'));
    const produtos = (await ctx.repo.obterVarios<Produto>(locais.map((id) => `produtos/${id}`)))
      .filter((p): p is Produto => !!p && !!p.bloco && !p.vinculoBloqueado && !p.vinculadoA);
    const decisoes = await Promise.all(
      produtos.map(async (p) => {
        const candidatos = (await candidatosDe(ctx, p, nota.cnpj)).map(comoCandidato);
        return { p, d: decidirPorEtiquetas(p.etiquetas ?? etiquetar(p.descricao), candidatos) };
      }),
    );

    const itensIa: ItemIa[] = [];
    const produtoDoItem = new Map<number, Produto>();
    for (const { p, d } of decisoes) {
      if (d.tipo === 'ligar') {
        const r = await vincular(ctx, p.id, d.id as ProdutoId, 'auto', 'etiquetas');
        if (r.ok) resumo.etiquetas++;
      } else if (d.tipo === 'ia') {
        const i = itensIa.length + 1;
        itensIa.push({ i, d: p.descricao, c: d.candidatos.map((c) => ({ id: c.id, d: c.descricao })) });
        produtoDoItem.set(i, p);
      }
    }
    resumo.duvidas = itensIa.length;
    if (!itensIa.length) {
      log('sucesso');
      return resumo;
    }

    const gasto = await ctx.repo.obter<DocGastoIa>(caminhoGastoIa(ctx.agora()));
    if ((gasto?.custoUsd ?? 0) >= IA_TETO_MENSAL_USD) {
      log('sucesso', 'teto-ia');
      return resumo;
    }

    const chamadas = lotes(itensIa);
    const respostas = await Promise.allSettled(chamadas.map((l) => ctx.classificarVinculos(l)));
    resumo.chamadasIa = chamadas.length;
    let falha: string | undefined;
    const aceitas: RespostaIa[] = [];
    for (const r of respostas) {
      if (r.status === 'fulfilled') {
        aceitas.push(r.value);
        resumo.custoUsd += r.value.custoUsd;
      } else {
        falha = r.reason instanceof IaSemDecisaoError ? `ia-${r.reason.message}` : 'ia-erro';
        if (r.reason instanceof IaSemDecisaoError) resumo.custoUsd += r.reason.custoUsd;
      }
    }
    await registrarGasto(ctx, resumo.custoUsd, chamadas.length);

    for (const { i, r } of aceitas.flatMap((a) => a.decisoes)) {
      const p = produtoDoItem.get(i);
      const item = itensIa[i - 1];
      if (!p || r === 'N') continue;
      if (r === 'A') {
        const candidatosVinculo = item.c.slice(0, MAX_CANDIDATOS_VINCULO).map((c) => c.id);
        await ctx.repo.gravar(`produtos/${p.id}`, { candidatosVinculo }, { merge: true });
        resumo.ambiguos++;
      } else if (item.c.some((c) => c.id === r)) {
        const v = await vincular(ctx, p.id, r as ProdutoId, 'auto', 'ia');
        if (v.ok) resumo.ia++;
      }
    }
    log(falha ? 'falha' : 'sucesso', falha);
  } catch {
    log('falha', 'vinculo-erro');
  }
  return resumo;
}
