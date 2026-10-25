import { modeloIa, type IdModeloIa } from '@shared/modelos-ia';

/**
 * Parte do pedido que depende do modelo. O fallback server-side em recusa só existe para Opus e
 * Sonnet; no Haiku os dois campos não podem ir.
 */
export function parametrosDoModelo(id: IdModeloIa) {
  const m = modeloIa(id);
  return {
    model: m.id,
    ...(m.fallback
      ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
      : {}),
  };
}
