import type { NfceParsed } from '@shared/model';
import { completarEmitente } from '../cnpj/completar-emitente';
import type { UrlValidada } from './allowlist';
import { classificarResposta } from './classificar-resposta';
import type { Contexto } from './contexto';
import { ErroNegocio, LayoutInesperadoError } from './erros';

/** Busca a página, classifica pelo conteúdo e interpreta. Lança `ErroNegocio` com o código. */
export async function obterNotaDaSefaz(ctx: Contexto, alvo: UrlValidada): Promise<NfceParsed> {
  const adaptador = ctx.adaptador(alvo.qr.uf);
  const resposta = await ctx.buscar(alvo.url);
  const classe = classificarResposta({
    status: resposta.status,
    html: resposta.html,
    chave: alvo.qr.chave,
    agora: ctx.agora(),
    pareceNota: adaptador.pareceNota,
  });
  if (classe !== 'ok') {
    if (classe.erro === 'layout-inesperado') ctx.registrarHtml?.(resposta.html, 'classificacao');
    throw new ErroNegocio(classe.erro);
  }
  let nota: NfceParsed;
  try {
    nota = adaptador.parse(resposta.html);
  } catch (e) {
    ctx.registrarHtml?.(resposta.html, 'parser');
    throw e instanceof ErroNegocio ? e : new LayoutInesperadoError(String(e));
  }
  if (nota.chave !== alvo.qr.chave)
    throw new LayoutInesperadoError('Chave da página difere da URL');
  return { ...nota, emitente: await completarEmitente(ctx, nota.emitente) };
}
