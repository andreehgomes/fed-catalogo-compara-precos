import { limparChave, validarChave } from '@shared/chave-acesso';
import type { EnfileirarResposta, Pendente, PreviewEntrada } from '@shared/model';
import type { Contexto } from '../importar/contexto';
import { ErroNegocio, paraErroImportacao } from '../importar/erros';
import { resolverEntrada } from '../importar/preview-nfce';

export const PRIMEIRA_TENTATIVA_MS = 15 * 60 * 1000;

export function caminhoPendente(uid: string, chave: string): string {
  return `usuarios/${uid}/pendentes/${chave}`;
}

/** Guarda a nota para importar quando a SEFAZ voltar (RF-10a). Idempotente por chave. */
export async function executarEnfileirar(
  uid: string,
  entrada: PreviewEntrada | null | undefined,
  ctx: Contexto,
): Promise<EnfileirarResposta> {
  const inicio = Date.now();
  try {
    const alvo = resolverEntrada(entrada);
    const chave = alvo.qr.chave;
    if (await ctx.repo.obter(`usuarios/${uid}/notas/${chave}`)) {
      throw new ErroNegocio('ja-importada', undefined, chave);
    }
    const caminho = caminhoPendente(uid, chave);
    const existente = await ctx.repo.obter<Pendente>(caminho);
    if (existente) return { ok: true, chave, proximaTentativa: existente.proximaTentativa };

    const agora = ctx.agora();
    const pendente: Pendente = {
      chave,
      url: alvo.url,
      status: 'aguardando',
      tentativas: 0,
      proximaTentativa: new Date(agora.getTime() + PRIMEIRA_TENTATIVA_MS).toISOString(),
      ultimoErro: null,
      criadaEm: agora.toISOString(),
    };
    await ctx.repo.gravar(caminho, { ...pendente });
    ctx.log({
      etapa: 'enfileiramento',
      uf: alvo.qr.uf,
      chave,
      duracaoMs: Date.now() - inicio,
      resultado: 'sucesso',
    });
    return { ok: true, chave, proximaTentativa: pendente.proximaTentativa };
  } catch (e) {
    const erro = paraErroImportacao(e);
    if (erro.codigo === 'desconhecido') throw e;
    return { ok: false, erro };
  }
}

/** "Tentar de novo" manual: volta um `falhou` para `aguardando` agora, com nova janela de 7 dias. */
export async function executarRetentar(
  uid: string,
  entrada: { chave?: unknown } | null | undefined,
  ctx: Contexto,
): Promise<EnfileirarResposta> {
  const chave = limparChave(String(entrada?.chave ?? ''));
  if (!validarChave(chave)) return { ok: false, erro: { codigo: 'chave-invalida' } };
  const caminho = caminhoPendente(uid, chave);
  const pendente = await ctx.repo.obter<Pendente>(caminho);
  if (!pendente) return { ok: false, erro: { codigo: 'nao-encontrada', chave } };
  const agora = ctx.agora().toISOString();
  await ctx.repo.gravar(
    caminho,
    {
      status: 'aguardando',
      tentativas: 0,
      proximaTentativa: agora,
      retentadaEm: agora,
      ultimoErro: null,
    },
    { merge: true },
  );
  return { ok: true, chave, proximaTentativa: agora };
}
