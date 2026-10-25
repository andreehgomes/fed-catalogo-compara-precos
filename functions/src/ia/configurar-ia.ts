import type {
  CodigoErroConfigIa,
  DefinirConfigIaResposta,
  GastoIaMes,
  ObterConfigIaResposta,
} from '@shared/model';
import { configIaDe, idModeloValido, type ConfigIa } from '@shared/modelos-ia';
import type { Contexto } from '../importar/contexto';
import { caminhoGastoIa } from '../vinculo/vincular-nota';
import { CAMINHO_CONFIG_IA, limparCacheConfigIa } from './config-ia-firestore';

function logConfig(ctx: Contexto, inicio: number, erro?: CodigoErroConfigIa): void {
  ctx.log({
    etapa: 'config-ia',
    uf: 'PR',
    duracaoMs: Date.now() - inicio,
    resultado: erro ? 'falha' : 'sucesso',
    ...(erro ? { erro } : {}),
  });
}

/** Configuração atual e gasto do mês, só para quem está em `ADMIN_UIDS`. */
export async function executarObterConfigIa(
  uid: string,
  admins: readonly string[],
  ctx: Contexto,
): Promise<ObterConfigIaResposta> {
  if (!admins.includes(uid)) return { ok: false, erro: { codigo: 'nao-autorizado' } };
  const [doc, gasto] = await Promise.all([
    ctx.repo.obter<Partial<ConfigIa>>(CAMINHO_CONFIG_IA),
    ctx.repo.obter<GastoIaMes>(caminhoGastoIa(ctx.agora())),
  ]);
  return { ok: true, config: configIaDe(doc), gasto };
}

/**
 * Grava o modelo de cada chamada (só ids da lista). A própria instância relê na hora; as outras
 * em até 60 s. O log não leva o uid.
 */
export async function executarDefinirConfigIa(
  uid: string,
  admins: readonly string[],
  entrada: { modeloNome?: unknown; modeloVinculo?: unknown } | null | undefined,
  ctx: Contexto,
): Promise<DefinirConfigIaResposta> {
  const inicio = Date.now();
  const falha = (codigo: CodigoErroConfigIa): DefinirConfigIaResposta => {
    logConfig(ctx, inicio, codigo);
    return { ok: false, erro: { codigo } };
  };
  if (!admins.includes(uid)) return falha('nao-autorizado');
  const { modeloNome, modeloVinculo } = entrada ?? {};
  if (!idModeloValido(modeloNome) || !idModeloValido(modeloVinculo))
    return falha('modelo-invalido');
  const config: ConfigIa = { modeloNome, modeloVinculo };
  await ctx.repo.gravar(CAMINHO_CONFIG_IA, { ...config, atualizadoEm: ctx.agora().toISOString() });
  limparCacheConfigIa();
  logConfig(ctx, inicio);
  return { ok: true, config };
}
