import type { Pendente } from '@shared/model';
import { urlPermitida } from '../importar/allowlist';
import type { Contexto } from '../importar/contexto';
import { ErroNegocio, paraErroImportacao } from '../importar/erros';
import { gravarNota } from '../importar/gravar-nota';
import { obterNotaDaSefaz } from '../importar/obter-nota';
import { caminhoPendente } from './enfileirar';

const MIN = 60 * 1000;
const HORA = 60 * MIN;

/** Espera depois de cada falha: 15 min (ao enfileirar) → 1 h → 6 h → 24 h → 24 h… */
export const BACKOFF_APOS_FALHA_MS = [HORA, 6 * HORA, 24 * HORA] as const;
export const PRAZO_FILA_MS = 7 * 24 * HORA;
export const LIMITE_POR_EXECUCAO = 20;
export const INTERVALO_ENTRE_FETCHES_MS = 1_000;

export interface ResumoReprocessamento {
  importadas: number;
  adiadas: number;
  falharam: number;
}

export async function executarReprocessamento(ctx: Contexto): Promise<ResumoReprocessamento> {
  const resumo: ResumoReprocessamento = { importadas: 0, adiadas: 0, falharam: 0 };
  const vencidos = await ctx.repo.consultarPendentesVencidos(ctx.agora(), LIMITE_POR_EXECUCAO);

  for (const [i, { uid, pendente }] of vencidos.entries()) {
    if (i > 0) await ctx.esperar(INTERVALO_ENTRE_FETCHES_MS);
    const resultado = await processar(ctx, uid, pendente);
    resumo[resultado]++;
  }
  return resumo;
}

async function processar(
  ctx: Contexto,
  uid: string,
  p: Pendente,
): Promise<keyof ResumoReprocessamento> {
  const inicio = Date.now();
  const caminho = caminhoPendente(uid, p.chave);
  const alvo = urlPermitida(p.url);
  try {
    if (!alvo) throw new ErroNegocio('url-invalida');
    const nota = await obterNotaDaSefaz(ctx, alvo);
    await gravarNota(ctx, uid, nota, { veioDaFila: true });
    await ctx.repo.apagar(caminho);
    ctx.log({
      etapa: 'reprocessamento',
      uf: alvo.qr.uf,
      chave: p.chave,
      duracaoMs: Date.now() - inicio,
      resultado: 'sucesso',
      qtdItens: nota.itens.length,
    });
    return 'importadas';
  } catch (e) {
    const { codigo } = paraErroImportacao(e);
    const agora = ctx.agora();
    const tentativas = p.tentativas + 1;
    const desde = new Date(p.retentadaEm ?? p.criadaEm).getTime();
    const venceu = agora.getTime() - desde >= PRAZO_FILA_MS;
    ctx.log({
      etapa: 'reprocessamento',
      uf: alvo?.qr.uf ?? '??',
      chave: p.chave,
      duracaoMs: Date.now() - inicio,
      resultado: 'falha',
      erro: codigo,
    });

    if (codigo === 'sefaz-indisponivel' && !venceu) {
      const espera =
        BACKOFF_APOS_FALHA_MS[Math.min(tentativas - 1, BACKOFF_APOS_FALHA_MS.length - 1)];
      await ctx.repo.gravar(
        caminho,
        {
          tentativas,
          ultimoErro: codigo,
          proximaTentativa: new Date(agora.getTime() + espera).toISOString(),
        },
        { merge: true },
      );
      return 'adiadas';
    }
    if (codigo === 'ja-importada') {
      await ctx.repo.apagar(caminho);
      return 'importadas';
    }
    await ctx.repo.gravar(
      caminho,
      { tentativas, ultimoErro: codigo, status: 'falhou' },
      { merge: true },
    );
    return 'falharam';
  }
}
