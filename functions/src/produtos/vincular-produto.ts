import type { Produto, ProdutoId } from '@shared/model';
import type { Contexto } from '../importar/contexto';
import { consumirRateLimit } from '../importar/rate-limit';

export type CodigoErroVinculo =
  | 'produto-invalido'
  | 'produto-inexistente'
  | 'eans-distintos'
  | 'mesmo-produto'
  | 'ciclo'
  | 'rate-limit';

export type RespostaVinculo =
  { ok: true; canonico: ProdutoId } | { ok: false; erro: { codigo: CodigoErroVinculo } };

export const MAX_SALTOS = 10;

const ID_VALIDO = /^(ean:\d{8,14}|loc:\d{14}:[A-Z0-9._-]+)$/;

function idValido(id: unknown): id is ProdutoId {
  return typeof id === 'string' && ID_VALIDO.test(id);
}

const caminho = (id: string) => `produtos/${id}`;

/** Segue `vinculadoA` até a raiz. Devolve null se houver ciclo ou produto faltando. */
async function canonicoDe(ctx: Contexto, id: ProdutoId): Promise<ProdutoId | null> {
  const vistos = new Set<string>();
  let atual: ProdutoId = id;
  for (let i = 0; i < MAX_SALTOS; i++) {
    if (vistos.has(atual)) return null;
    vistos.add(atual);
    const p = await ctx.repo.obter<Produto>(caminho(atual));
    if (!p) return null;
    if (!p.vinculadoA) return atual;
    atual = p.vinculadoA;
  }
  return null;
}

/** Aponta para `novo` todos os produtos que apontavam para `antigo`. */
async function reapontar(ctx: Contexto, antigo: ProdutoId, novo: ProdutoId): Promise<void> {
  const filhos = await ctx.repo.consultar<Produto>('produtos', [
    { campo: 'vinculadoA', op: '==', valor: antigo },
  ]);
  await ctx.repo.lote(
    filhos
      .filter((f) => f.dados.id !== novo)
      .map((f) => ({
        tipo: 'gravar' as const,
        caminho: f.caminho,
        dados: { vinculadoA: novo },
        opcoes: { merge: true },
      })),
  );
}

/**
 * RF-18: diz que `origem` é o mesmo produto que `destino`. O vínculo vale para a base
 * compartilhada. Um `ean:` nunca é vinculado a outro `ean:` diferente; quando um lado
 * tem EAN, ele vira o canônico.
 */
export async function executarVincular(
  uid: string,
  entrada: { origem?: unknown; destino?: unknown } | null | undefined,
  ctx: Contexto,
): Promise<RespostaVinculo> {
  const inicio = Date.now();
  const falha = (codigo: CodigoErroVinculo): RespostaVinculo => {
    ctx.log({
      etapa: 'vinculo',
      uf: 'PR',
      duracaoMs: Date.now() - inicio,
      resultado: 'falha',
      erro: codigo,
    });
    return { ok: false, erro: { codigo } };
  };
  const { origem, destino } = entrada ?? {};
  if (!idValido(origem) || !idValido(destino)) return falha('produto-invalido');
  if (origem === destino) return falha('mesmo-produto');
  if (!(await consumirRateLimit(ctx.repo, uid, ctx.agora()))) return falha('rate-limit');

  const [pOrigem, pDestino] = await ctx.repo.obterVarios<Produto>([
    caminho(origem),
    caminho(destino),
  ]);
  if (!pOrigem || !pDestino) return falha('produto-inexistente');

  const raizOrigem = await canonicoDe(ctx, origem);
  const raizDestino = await canonicoDe(ctx, destino);
  if (!raizOrigem || !raizDestino) return falha('ciclo');
  if (raizOrigem === raizDestino) return { ok: true, canonico: raizDestino };
  if (raizOrigem.startsWith('ean:') && raizDestino.startsWith('ean:'))
    return falha('eans-distintos');

  const [filho, canonico] = raizOrigem.startsWith('ean:')
    ? [raizDestino, raizOrigem]
    : [raizOrigem, raizDestino];
  await ctx.repo.gravar(caminho(filho), { vinculadoA: canonico }, { merge: true });
  await reapontar(ctx, filho, canonico);
  ctx.log({ etapa: 'vinculo', uf: 'PR', duracaoMs: Date.now() - inicio, resultado: 'sucesso' });
  return { ok: true, canonico };
}

export async function executarDesvincular(
  entrada: { id?: unknown } | null | undefined,
  ctx: Contexto,
): Promise<RespostaVinculo> {
  const id = entrada?.id;
  if (!idValido(id)) return { ok: false, erro: { codigo: 'produto-invalido' } };
  const p = await ctx.repo.obter<Produto>(caminho(id));
  if (!p) return { ok: false, erro: { codigo: 'produto-inexistente' } };
  await ctx.repo.gravar(caminho(id), { vinculadoA: null }, { merge: true });
  return { ok: true, canonico: id };
}
