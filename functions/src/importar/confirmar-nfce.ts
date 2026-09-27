import { limparChave, validarChave } from '@shared/chave-acesso';
import type { ConfirmarResposta } from '@shared/model';
import type { Contexto } from './contexto';
import { ErroNegocio, paraErroImportacao } from './erros';
import { gravarNota } from './gravar-nota';
import { caminhoPreview, type DocPreview } from './preview-nfce';

/** Confirma a importação a partir do preview guardado — nunca de dados enviados pelo cliente. */
export async function executarConfirmacao(
  uid: string,
  entrada: { chave?: unknown } | null | undefined,
  ctx: Contexto,
): Promise<ConfirmarResposta> {
  const inicio = Date.now();
  const chave = limparChave(String(entrada?.chave ?? ''));
  try {
    if (!validarChave(chave)) throw new ErroNegocio('chave-invalida');
    const caminho = caminhoPreview(uid, chave);
    const preview = await ctx.repo.obter<DocPreview>(caminho);
    if (!preview || preview.uid !== uid || preview.expiraEmIso <= ctx.agora().toISOString()) {
      throw new ErroNegocio('preview-expirado', undefined, chave);
    }
    await gravarNota(ctx, uid, preview.nota, { veioDaFila: false });
    await ctx.repo.apagar(caminho);
    ctx.log({
      etapa: 'confirmacao',
      uf: 'PR',
      chave,
      duracaoMs: Date.now() - inicio,
      resultado: 'sucesso',
      qtdItens: preview.nota.itens.length,
    });
    return { ok: true, chave };
  } catch (e) {
    const erro = paraErroImportacao(e);
    ctx.log({
      etapa: 'confirmacao',
      uf: 'PR',
      chave,
      duracaoMs: Date.now() - inicio,
      resultado: 'falha',
      erro: erro.codigo,
    });
    if (erro.codigo === 'desconhecido') throw e;
    return { ok: false, erro };
  }
}
