import type { Repositorio } from '../dados/repositorio';

export const LIMITE_POR_HORA = 30;
export const JANELA_MS = 60 * 60 * 1000;

interface DocRateLimit {
  janelaInicio: string;
  contagem: number;
}

/** Janela fixa de 1 h por usuário em `rateLimit/{uid}`. Devolve false quando estourou. */
export async function consumirRateLimit(
  repo: Repositorio,
  uid: string,
  agora: Date,
  limite = LIMITE_POR_HORA,
): Promise<boolean> {
  const caminho = `rateLimit/${uid}`;
  return repo.transacao(async (tx) => {
    const atual = await tx.obter<DocRateLimit>(caminho);
    const inicio = atual ? new Date(atual.janelaInicio).getTime() : 0;
    const vencida = !atual || agora.getTime() - inicio >= JANELA_MS;
    const contagem = vencida ? 0 : atual.contagem;
    if (contagem >= limite) return false;
    tx.gravar(caminho, {
      janelaInicio: vencida ? agora.toISOString() : atual.janelaInicio,
      contagem: contagem + 1,
    });
    return true;
  });
}
