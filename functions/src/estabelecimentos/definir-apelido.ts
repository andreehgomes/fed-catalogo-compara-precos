import { limparApelido, nomeExibido } from '@shared/apelido';
import { validarCnpj } from '@shared/chave-acesso';
import type {
  ApelidoEstabelecimento,
  DefinirApelidoResposta,
  Estabelecimento,
} from '@shared/model';
import type { Operacao } from '../dados/repositorio';
import type { Contexto } from '../importar/contexto';
import { ErroNegocio, paraErroImportacao } from '../importar/erros';
import { caminhoApelido } from '../importar/gravar-nota';
import { consumirRateLimit } from '../importar/rate-limit';
import { operacoesDeNome } from './propagar-nome';

/**
 * RF-09/10: grava (ou apaga, com `null`) o apelido pessoal da loja e acerta o nome nas notas
 * deste uid. `estabelecimentos/{cnpj}` nunca muda. O log não leva o CNPJ nem o apelido.
 */
export async function executarDefinirApelido(
  uid: string,
  entrada: { cnpj?: unknown; apelido?: unknown } | null | undefined,
  ctx: Contexto,
): Promise<DefinirApelidoResposta> {
  const inicio = Date.now();
  let uf = '??';
  try {
    const cnpj = String(entrada?.cnpj ?? '').replace(/\D/g, '');
    if (!validarCnpj(cnpj)) throw new ErroNegocio('nao-encontrada');
    if (!(await consumirRateLimit(ctx.repo, uid, ctx.agora()))) throw new ErroNegocio('rate-limit');
    const estab = await ctx.repo.obter<Estabelecimento>(`estabelecimentos/${cnpj}`);
    if (!estab) throw new ErroNegocio('nao-encontrada');
    uf = estab.uf;

    const bruto = entrada?.apelido;
    if (bruto !== undefined && bruto !== null && typeof bruto !== 'string')
      throw new ErroNegocio('apelido-invalido');
    const limpo = limparApelido(bruto, estab.nome);
    if (!limpo.valido) throw new ErroNegocio('apelido-invalido');
    const { apelido } = limpo;

    const notas = await operacoesDeNome(ctx.repo, uid, cnpj, nomeExibido(estab, apelido));
    const doc: Operacao = apelido
      ? {
          tipo: 'gravar',
          caminho: caminhoApelido(uid, cnpj),
          dados: {
            cnpj,
            apelido,
            atualizadoEm: ctx.agora().toISOString(),
          } satisfies ApelidoEstabelecimento,
        }
      : { tipo: 'apagar', caminho: caminhoApelido(uid, cnpj) };
    await ctx.repo.lote([doc, ...notas]);

    ctx.log({
      etapa: 'apelido',
      uf,
      duracaoMs: Date.now() - inicio,
      resultado: 'sucesso',
      contagens: { notasAtualizadas: notas.length, removido: apelido ? 0 : 1 },
    });
    return { ok: true, apelido, notasAtualizadas: notas.length };
  } catch (e) {
    const erro = paraErroImportacao(e);
    ctx.log({
      etapa: 'apelido',
      uf,
      duracaoMs: Date.now() - inicio,
      resultado: 'falha',
      erro: erro.codigo,
    });
    if (erro.codigo === 'desconhecido') throw e;
    return { ok: false, erro };
  }
}
