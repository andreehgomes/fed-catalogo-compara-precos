/** Sem efeitos colaterais (ao contrário de `config.ts`), para os testes importarem. */
export const IA_MODELO = 'claude-opus-5-5';
/**
 * Nome legível dos produtos. Começa igual ao vínculo (Opus 5.5, com fallback em recusa); o
 * Haiku 5.5 é mais rápido e barato, mas não tem fallback server-side: a troca depende da
 * medição de `scripts/avaliar-ia-nome.ts` e da decisão do usuário.
 */
export const IA_MODELO_NOME = IA_MODELO;
export const IA_TIMEOUT_MS = 25_000;
/** Preço do Claude Opus 5.5 por milhão de tokens. */
export const IA_USD_POR_MTOK = { entrada: 4, saida: 20 } as const;
