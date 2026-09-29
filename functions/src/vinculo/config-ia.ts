/** Sem efeitos colaterais (ao contrário de `config.ts`), para os testes importarem. */
export const IA_MODELO = 'claude-opus-5-5';
export const IA_TETO_MENSAL_USD = 5;
export const IA_TIMEOUT_MS = 25_000;
/** Preço do Claude Opus 5.5 por milhão de tokens. */
export const IA_USD_POR_MTOK = { entrada: 4, saida: 20 } as const;
