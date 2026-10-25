import { configIaDe, type ConfigIa } from '@shared/modelos-ia';
import type { Contexto } from '../importar/contexto';

export const CAMINHO_CONFIG_IA = 'controle/configIa';
export const CACHE_CONFIG_IA_MS = 60_000;

let cache: { valor: ConfigIa; ate: number } | null = null;

/** Depois de gravar a configuração, a própria instância relê na hora (as outras em até 60 s). */
export function limparCacheConfigIa(): void {
  cache = null;
}

/**
 * Modelo de cada chamada, de `controle/configIa`, com cache por instância. Documento ausente,
 * campo inválido ou leitura que falha: o padrão (Opus 5.5), sem derrubar quem chamou.
 */
export async function obterModelos(ctx: Contexto): Promise<ConfigIa> {
  const agora = ctx.agora().getTime();
  if (cache && cache.ate > agora) return cache.valor;
  let valor: ConfigIa;
  try {
    valor = configIaDe(await ctx.repo.obter<Partial<ConfigIa>>(CAMINHO_CONFIG_IA));
  } catch {
    return configIaDe(null);
  }
  cache = { valor, ate: agora + CACHE_CONFIG_IA_MS };
  return valor;
}
