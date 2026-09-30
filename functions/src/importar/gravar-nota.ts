import { nomeExibido } from '@shared/apelido';
import type { ApelidoEstabelecimento, Estabelecimento, NfceParsed, Nota } from '@shared/model';
import type { Contexto } from './contexto';
import { operacoesDeNome } from '../estabelecimentos/propagar-nome';
import { vincularNota } from '../vinculo/vincular-nota';
import { montarNota, publicarPrecos } from './publicar-precos';

interface DocImportada {
  importadaEm: string;
  qtdUsuarios: number;
}

export interface ResultadoGravacao {
  jaExistia: boolean;
  publicou: boolean;
  apelidoNovo: boolean;
}

export function caminhoApelido(uid: string, cnpj: string): string {
  return `usuarios/${uid}/estabelecimentos/${cnpj}`;
}

/**
 * Rotina comum à confirmação (6.5) e à fila (6.6). Numa transação: nota do usuário,
 * perfil mínimo, estabelecimento, apelido e `nfceImportadas/{chave}` (dedup RF-09). A nota
 * nasce com o nome exibido do usuário (apelido → fantasia → razão social). Um apelido novo é
 * propagado às outras notas da loja depois da transação, sem derrubar a importação. Os
 * preços só são publicados na primeira importação da chave, fora da transação e em lotes, e
 * só então os produtos novos são ligados a outros mercados (etiquetas + IA).
 *
 * `opcoes.apelido`: string grava o apelido; `null` ou `undefined` mantêm o que houver.
 */
export async function gravarNota(
  ctx: Contexto,
  uid: string,
  parsed: NfceParsed,
  opcoes: { veioDaFila: boolean; apelido?: string | null },
): Promise<ResultadoGravacao> {
  const agora = ctx.agora();
  const cnpj = parsed.emitente.cnpj;
  const caminhoNota = `usuarios/${uid}/notas/${parsed.chave}`;
  const caminhoImportada = `nfceImportadas/${parsed.chave}`;
  let nota: Nota | null = null;

  const resultado = await ctx.repo.transacao(async (tx) => {
    const [existente, importada, perfil, apelidoAtual] = await Promise.all([
      tx.obter<Nota>(caminhoNota),
      tx.obter<DocImportada>(caminhoImportada),
      tx.obter(`usuarios/${uid}`),
      tx.obter<ApelidoEstabelecimento>(caminhoApelido(uid, cnpj)),
    ]);
    if (existente) return { jaExistia: true, publicou: false, apelidoNovo: false };

    const apelido = opcoes.apelido ?? apelidoAtual?.apelido ?? null;
    const apelidoNovo = !!opcoes.apelido && opcoes.apelido !== apelidoAtual?.apelido;
    nota = montarNota(parsed, agora, opcoes.veioDaFila, nomeExibido(parsed.emitente, apelido));

    tx.gravar(caminhoNota, { ...nota });
    if (!perfil) tx.gravar(`usuarios/${uid}`, { criadoEm: agora.toISOString() });
    if (apelidoNovo) {
      const doc: ApelidoEstabelecimento = {
        cnpj,
        apelido: opcoes.apelido as string,
        atualizadoEm: agora.toISOString(),
      };
      tx.gravar(caminhoApelido(uid, cnpj), { ...doc });
    }
    const estabelecimento: Estabelecimento = {
      cnpj,
      nome: parsed.emitente.nome,
      ...(parsed.emitente.fantasia ? { fantasia: parsed.emitente.fantasia } : {}),
      endereco: parsed.emitente.endereco,
      cidade: parsed.emitente.cidade,
      uf: parsed.emitente.uf,
      atualizadoEm: agora.toISOString(),
      ...(parsed.emitente.fantasiaConsultadaEm
        ? { fantasiaConsultadaEm: parsed.emitente.fantasiaConsultadaEm }
        : {}),
    };
    tx.gravar(`estabelecimentos/${cnpj}`, { ...estabelecimento }, { merge: true });
    tx.gravar(caminhoImportada, {
      importadaEm: importada?.importadaEm ?? agora.toISOString(),
      qtdUsuarios: (importada?.qtdUsuarios ?? 0) + 1,
    });
    return { jaExistia: false, publicou: !importada, apelidoNovo };
  });

  const gravada = nota as Nota | null;
  if (resultado.apelidoNovo && gravada) await propagarApelido(ctx, uid, gravada);
  if (resultado.publicou && gravada)
    await vincularNota(ctx, gravada, await publicarPrecos(ctx.repo, gravada));
  return resultado;
}

/** RF-07 / RNF-08: falha aqui só é logada; a nota nova e o apelido já estão gravados. */
async function propagarApelido(ctx: Contexto, uid: string, nota: Nota): Promise<void> {
  const inicio = Date.now();
  try {
    await ctx.repo.lote(await operacoesDeNome(ctx.repo, uid, nota.cnpj, nota.estabelecimentoNome));
  } catch {
    ctx.log({
      etapa: 'confirmacao',
      uf: 'PR',
      duracaoMs: Date.now() - inicio,
      resultado: 'falha',
      contagens: { apelidoPropagacaoFalhou: 1 },
    });
  }
}
