/**
 * Modelos da Claude API que o administrador pode escolher para cada chamada (nome legível e
 * vínculo). Preço por milhão de tokens; o do Haiku vale para pedidos de até 100K de entrada,
 * que é sempre o caso aqui. `fallback`: a API refaz a chamada em outro modelo se este recusar.
 */
export const MODELOS_IA = [
  {
    id: 'claude-opus-5-5',
    rotulo: 'Claude Opus 5.5',
    resumo: 'O mais preciso, o mais lento',
    entradaUsdMTok: 4,
    saidaUsdMTok: 20,
    fallback: true,
  },
  {
    id: 'claude-sonnet-5-5',
    rotulo: 'Claude Sonnet 5.5',
    resumo: 'Equilíbrio entre precisão e velocidade',
    entradaUsdMTok: 2,
    saidaUsdMTok: 10,
    fallback: true,
  },
  {
    id: 'claude-haiku-5-5',
    rotulo: 'Claude Haiku 5.5',
    resumo: 'O mais rápido e barato',
    entradaUsdMTok: 0.1,
    saidaUsdMTok: 0.5,
    fallback: false,
  },
] as const;

export type ModeloIa = (typeof MODELOS_IA)[number];
export type IdModeloIa = ModeloIa['id'];

export const MODELO_IA_PADRAO: IdModeloIa = 'claude-opus-5-5';

/** Modelo de cada chamada: `controle/configIa`. */
export interface ConfigIa {
  modeloNome: IdModeloIa;
  modeloVinculo: IdModeloIa;
}

export function idModeloValido(id: unknown): id is IdModeloIa {
  return MODELOS_IA.some((m) => m.id === id);
}

/** O modelo pelo id; id desconhecido vira o padrão. */
export function modeloIa(id: unknown): ModeloIa {
  return MODELOS_IA.find((m) => m.id === id) ?? MODELOS_IA[0];
}

/** Documento ausente ou com campo inválido: o padrão naquele campo. */
export function configIaDe(
  doc: Partial<Record<keyof ConfigIa, unknown>> | null | undefined,
): ConfigIa {
  return {
    modeloNome: idModeloValido(doc?.modeloNome) ? doc.modeloNome : MODELO_IA_PADRAO,
    modeloVinculo: idModeloValido(doc?.modeloVinculo) ? doc.modeloVinculo : MODELO_IA_PADRAO,
  };
}

export function custoDoModelo(
  id: IdModeloIa,
  uso: { input_tokens: number; output_tokens: number },
): number {
  const m = modeloIa(id);
  return (uso.input_tokens * m.entradaUsdMTok + uso.output_tokens * m.saidaUsdMTok) / 1e6;
}
