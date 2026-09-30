import type { Emitente, Estabelecimento } from '@shared/model';
import { limparFantasia, precisaConsultar } from '@shared/nome-fantasia';
import type { Contexto } from '../importar/contexto';

const ERROS_CONHECIDOS = new Set(['cnpj-indisponivel', 'cnpj-invalido']);

function comFantasia(
  emitente: Emitente,
  fantasia: string | undefined,
  fantasiaConsultadaEm?: string,
): Emitente {
  const { fantasia: _f, fantasiaConsultadaEm: _c, ...base } = emitente;
  return {
    ...base,
    ...(fantasia ? { fantasia } : {}),
    ...(fantasiaConsultadaEm ? { fantasiaConsultadaEm } : {}),
  };
}

/**
 * Completa o nome fantasia pelo CNPJ, com cache de 180 dias em `estabelecimentos/{cnpj}`.
 * Nunca lança: qualquer falha devolve o emitente com o nome já conhecido (RF-07, RNF-08).
 * O log leva só contagens, nunca CNPJ nem nome.
 */
export async function completarEmitente(ctx: Contexto, emitente: Emitente): Promise<Emitente> {
  const inicio = Date.now();
  const contagens = { cache: 0, brasilapi: 0, minhareceita: 0, semFantasia: 0, naoEncontrado: 0 };
  const log = (resultado: 'sucesso' | 'falha', erro?: string) =>
    ctx.log({
      etapa: 'cnpj',
      uf: emitente.uf,
      duracaoMs: Date.now() - inicio,
      resultado,
      contagens,
      ...(erro ? { erro } : {}),
    });

  let estab: Estabelecimento | null = null;
  try {
    const agora = ctx.agora();
    estab = await ctx.repo.obter<Estabelecimento>(`estabelecimentos/${emitente.cnpj}`);
    const conhecido = estab?.fantasia ?? emitente.fantasia;
    if (!precisaConsultar(estab, agora)) {
      contagens.cache = 1;
      log('sucesso');
      return comFantasia(emitente, conhecido);
    }
    const r = await ctx.consultarCnpj(emitente.cnpj);
    contagens[r.fonte] = 1;
    let fantasia: string | undefined;
    if (r.status === 'nao-encontrado') contagens.naoEncontrado = 1;
    else {
      fantasia = limparFantasia(r.nomeFantasia, emitente.nome);
      if (!fantasia) contagens.semFantasia = 1;
    }
    log('sucesso');
    return comFantasia(emitente, fantasia ?? conhecido, agora.toISOString());
  } catch (e) {
    const codigo = e instanceof Error && ERROS_CONHECIDOS.has(e.message) ? e.message : 'desconhecido';
    log('falha', codigo);
    return comFantasia(emitente, estab?.fantasia ?? emitente.fantasia);
  }
}
