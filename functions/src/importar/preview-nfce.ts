import { extrairChave, limparChave, montarUrlQrV3, validarChave } from '@shared/chave-acesso';
import type { NfceParsed, PreviewEntrada, PreviewResposta } from '@shared/model';
import { urlPermitida, type UrlValidada } from './allowlist';
import type { Contexto } from './contexto';
import { ErroNegocio, paraErroImportacao } from './erros';
import { obterNotaDaSefaz } from './obter-nota';
import { consumirRateLimit } from './rate-limit';

export const PREVIEW_TTL_MS = 30 * 60 * 1000;

/**
 * Se a URL v3 montada só com a chave abre a nota no portal do PR. Não deu para confirmar
 * no spike de 27/09/2026 (portal fora do ar); se o spike da 6.3 mostrar que não, mudar
 * para false e o app passa a pedir o QR (`chave-sem-qr`).
 */
export const ACEITA_V3_SO_COM_CHAVE = true;

export interface DocPreview {
  uid: string;
  chave: string;
  url: string;
  nota: NfceParsed;
  criadoEm: string;
  expiraEmIso: string;
  expiraEm: Date;
}

export function caminhoPreview(uid: string, chave: string): string {
  return `previews/${uid}_${chave}`;
}

export function resolverEntrada(entrada: PreviewEntrada | null | undefined): UrlValidada {
  if (entrada?.url) {
    const validada = urlPermitida(entrada.url);
    if (!validada) throw new ErroNegocio('url-invalida');
    return validada;
  }
  if (entrada?.chave) {
    const chave = limparChave(String(entrada.chave));
    if (!validarChave(chave)) throw new ErroNegocio('chave-invalida');
    if (extrairChave(chave).uf !== 'PR') throw new ErroNegocio('uf-nao-suportada');
    if (!ACEITA_V3_SO_COM_CHAVE) throw new ErroNegocio('chave-sem-qr');
    const validada = urlPermitida(montarUrlQrV3(chave));
    if (!validada) throw new ErroNegocio('chave-invalida');
    return validada;
  }
  throw new ErroNegocio('url-invalida');
}

export async function executarPreview(
  uid: string,
  entrada: PreviewEntrada | null | undefined,
  ctx: Contexto,
): Promise<PreviewResposta> {
  const inicio = Date.now();
  let uf = '??';
  let chave: string | undefined;
  try {
    const alvo = resolverEntrada(entrada);
    uf = alvo.qr.uf;
    chave = alvo.qr.chave;
    if (!(await consumirRateLimit(ctx.repo, uid, ctx.agora()))) throw new ErroNegocio('rate-limit');
    if (await ctx.repo.obter(`usuarios/${uid}/notas/${chave}`)) {
      throw new ErroNegocio('ja-importada', undefined, chave);
    }
    const nota = await obterNotaDaSefaz(ctx, alvo);
    const agora = ctx.agora();
    const expira = new Date(agora.getTime() + PREVIEW_TTL_MS);
    const doc: DocPreview = {
      uid,
      chave,
      url: alvo.url,
      nota,
      criadoEm: agora.toISOString(),
      expiraEmIso: expira.toISOString(),
      expiraEm: expira,
    };
    await ctx.repo.gravar(caminhoPreview(uid, chave), { ...doc });
    ctx.log({
      etapa: 'preview',
      uf,
      chave,
      duracaoMs: Date.now() - inicio,
      resultado: 'sucesso',
      qtdItens: nota.itens.length,
    });
    return { ok: true, nota };
  } catch (e) {
    const erro = paraErroImportacao(e);
    ctx.log({
      etapa: 'preview',
      uf,
      chave,
      duracaoMs: Date.now() - inicio,
      resultado: 'falha',
      erro: erro.codigo,
    });
    if (erro.codigo === 'desconhecido') throw e;
    return { ok: false, erro };
  }
}
