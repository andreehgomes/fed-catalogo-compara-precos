import type { CodigoErroRenomear, Nota, Produto, RenomearProdutoResposta } from '@shared/model';
import { limparNomeProduto } from '@shared/nome-produto';
import type { Operacao, Repositorio } from '../dados/repositorio';
import type { Contexto } from '../importar/contexto';
import { consumirRateLimit } from '../importar/rate-limit';
import { idValido } from './vincular-produto';

/** Notas do uid com o produto, pelos mercados onde ele foi visto (a consulta é por `cnpj`). */
async function operacoesDeNomeDoItem(
  repo: Repositorio,
  uid: string,
  produto: Produto,
  nome: string,
): Promise<Operacao[]> {
  const cnpjs = produto.cnpjs?.length ? produto.cnpjs : [produto.id.split(':')[1]];
  const porCnpj = await Promise.all(
    [...new Set(cnpjs)].map((cnpj) =>
      repo.consultar<Nota>(`usuarios/${uid}/notas`, [{ campo: 'cnpj', op: '==', valor: cnpj }]),
    ),
  );
  return porCnpj.flat().flatMap(({ caminho, dados }) => {
    const muda = dados.itens.some((i) => i.produtoId === produto.id && i.nome !== nome);
    if (!muda) return [];
    const itens = dados.itens.map((i) => (i.produtoId === produto.id ? { ...i, nome } : i));
    return [{ tipo: 'gravar' as const, caminho, dados: { itens }, opcoes: { merge: true } }];
  });
}

/**
 * Correção do nome legível (D-09): grava em `produtos/{id}` com `nomeOrigem: 'manual'`, que a IA
 * nunca sobrescreve, e acerta o nome nas notas deste uid. É uma correção da base compartilhada;
 * revisitar (nome pessoal) quando o app tiver outros usuários. O log leva só contagens.
 */
export async function executarRenomearProduto(
  uid: string,
  entrada: { id?: unknown; nome?: unknown } | null | undefined,
  ctx: Contexto,
): Promise<RenomearProdutoResposta> {
  const inicio = Date.now();
  const falha = (codigo: CodigoErroRenomear): RenomearProdutoResposta => {
    ctx.log({
      etapa: 'nome-manual',
      uf: 'PR',
      duracaoMs: Date.now() - inicio,
      resultado: 'falha',
      erro: codigo,
    });
    return { ok: false, erro: { codigo } };
  };
  const id = entrada?.id;
  if (!idValido(id)) return falha('produto-invalido');
  const nome = typeof entrada?.nome === 'string' ? limparNomeProduto(entrada.nome) : null;
  if (!nome) return falha('nome-invalido');
  if (!(await consumirRateLimit(ctx.repo, uid, ctx.agora()))) return falha('rate-limit');
  const produto = await ctx.repo.obter<Produto>(`produtos/${id}`);
  if (!produto) return falha('produto-inexistente');

  const notas = await operacoesDeNomeDoItem(ctx.repo, uid, { ...produto, id }, nome);
  await ctx.repo.lote([
    {
      tipo: 'gravar',
      caminho: `produtos/${id}`,
      dados: { nome, nomeOrigem: 'manual' },
      opcoes: { merge: true },
    },
    ...notas,
  ]);
  ctx.log({
    etapa: 'nome-manual',
    uf: 'PR',
    duracaoMs: Date.now() - inicio,
    resultado: 'sucesso',
    contagens: { notasAtualizadas: notas.length },
  });
  return { ok: true, nome, notasAtualizadas: notas.length };
}
