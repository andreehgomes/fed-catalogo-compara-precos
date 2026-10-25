import { produtoIdDe } from '@shared/gtin';
import type { ItemNfce, NfceParsed, Produto, ProdutoId } from '@shared/model';
import { etiquetasDaIa } from '@shared/nome-produto';
import type { Contexto } from '../importar/contexto';
import { erroIa, type ErroIa } from '../vinculo/ia';
import { registrarGasto } from '../vinculo/vincular-nota';

/**
 * Nome legível dos itens: produto que já tem nome empresta o nome; os outros vão numa chamada à
 * IA (uma linha por produto, mesmo que repita na nota), que também devolve as etiquetas. Nunca
 * lança: sem resposta o item segue sem nome e a próxima nota com o produto tenta de novo.
 */
export async function nomearItens(ctx: Contexto, nota: NfceParsed): Promise<NfceParsed> {
  const inicio = Date.now();
  const contagens = { itens: nota.itens.length, daBase: 0, ia: 0, semNome: 0, chamadas: 0 };
  let falha: ErroIa | undefined;
  let itens: ItemNfce[] = nota.itens;
  try {
    const ids = nota.itens.map((i) => produtoIdDe(i.ean, nota.emitente.cnpj, i.codigo));
    const unicos = [...new Set(ids)];
    const lidos = await ctx.repo.obterVarios<Produto>(unicos.map((id) => `produtos/${id}`));
    const nomeDaBase = new Map(unicos.map((id, k) => [id, lidos[k]?.nome]));

    const faltam = new Map<ProdutoId, string>();
    ids.forEach((id, k) => {
      if (!nomeDaBase.get(id) && !faltam.has(id)) faltam.set(id, nota.itens[k].descricao);
    });
    const daIa = new Map<ProdutoId, Pick<ItemNfce, 'nome' | 'etiquetas'>>();
    if (faltam.size) {
      const lista = [...faltam];
      try {
        const r = await ctx.normalizarNomes(lista.map(([, d], k) => ({ i: k + 1, d })));
        contagens.chamadas = r.chamadas;
        if (r.erro) falha = erroIa(r.erro);
        for (const [i, n] of r.nomes) {
          const [id, descricao] = lista[i - 1];
          daIa.set(id, { nome: n.nome, etiquetas: etiquetasDaIa(n, descricao) });
        }
        await registrarGasto(ctx, 'nome', r.custoUsd, r.chamadas);
      } catch (e) {
        falha = erroIa(e);
      }
    }

    itens = nota.itens.map((item, k) => {
      const base = nomeDaBase.get(ids[k]);
      if (base) {
        contagens.daBase++;
        return { ...item, nome: base };
      }
      const ia = daIa.get(ids[k]);
      if (ia) {
        contagens.ia++;
        return { ...item, ...ia };
      }
      contagens.semNome++;
      return item;
    });
  } catch {
    falha ??= { erro: 'nome-erro' };
  }
  ctx.log({
    etapa: 'nome',
    uf: nota.emitente.uf,
    duracaoMs: Date.now() - inicio,
    resultado: falha ? 'falha' : 'sucesso',
    chave: nota.chave,
    ...(falha ? { erro: falha.erro } : {}),
    ...(falha?.tipo ? { tipoErro: falha.tipo } : {}),
    contagens,
  });
  return { ...nota, itens };
}
