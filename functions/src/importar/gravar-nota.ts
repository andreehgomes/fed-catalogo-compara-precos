import type { Estabelecimento, NfceParsed, Nota } from '@shared/model';
import type { Contexto } from './contexto';
import { vincularNota } from '../vinculo/vincular-nota';
import { montarNota, publicarPrecos } from './publicar-precos';

interface DocImportada {
  importadaEm: string;
  qtdUsuarios: number;
}

export interface ResultadoGravacao {
  jaExistia: boolean;
  publicou: boolean;
}

/**
 * Rotina comum à confirmação (6.5) e à fila (6.6). Numa transação: nota do usuário,
 * perfil mínimo, estabelecimento e `nfceImportadas/{chave}` (dedup RF-09). Os preços só
 * são publicados na primeira importação da chave, fora da transação e em lotes, e só então
 * os produtos novos são ligados a outros mercados (etiquetas + IA).
 */
export async function gravarNota(
  ctx: Contexto,
  uid: string,
  parsed: NfceParsed,
  opcoes: { veioDaFila: boolean },
): Promise<ResultadoGravacao> {
  const agora = ctx.agora();
  const nota: Nota = montarNota(parsed, agora, opcoes.veioDaFila);
  const caminhoNota = `usuarios/${uid}/notas/${nota.chave}`;
  const caminhoImportada = `nfceImportadas/${nota.chave}`;

  const resultado = await ctx.repo.transacao(async (tx) => {
    const [existente, importada, perfil] = await Promise.all([
      tx.obter<Nota>(caminhoNota),
      tx.obter<DocImportada>(caminhoImportada),
      tx.obter(`usuarios/${uid}`),
    ]);
    if (existente) return { jaExistia: true, publicou: false };

    tx.gravar(caminhoNota, { ...nota });
    if (!perfil) tx.gravar(`usuarios/${uid}`, { criadoEm: agora.toISOString() });
    const estabelecimento: Estabelecimento = {
      cnpj: parsed.emitente.cnpj,
      nome: parsed.emitente.nome,
      ...(parsed.emitente.fantasia ? { fantasia: parsed.emitente.fantasia } : {}),
      endereco: parsed.emitente.endereco,
      cidade: parsed.emitente.cidade,
      uf: parsed.emitente.uf,
      atualizadoEm: agora.toISOString(),
    };
    tx.gravar(`estabelecimentos/${parsed.emitente.cnpj}`, { ...estabelecimento }, { merge: true });
    tx.gravar(caminhoImportada, {
      importadaEm: importada?.importadaEm ?? agora.toISOString(),
      qtdUsuarios: (importada?.qtdUsuarios ?? 0) + 1,
    });
    return { jaExistia: false, publicou: !importada };
  });

  if (resultado.publicou) await vincularNota(ctx, nota, await publicarPrecos(ctx.repo, nota));
  return resultado;
}
