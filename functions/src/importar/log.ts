import { logger } from 'firebase-functions';

export type EtapaImportacao =
  'preview' | 'confirmacao' | 'enfileiramento' | 'reprocessamento' | 'vinculo';

export interface RegistroImportacao {
  etapa: EtapaImportacao;
  uf: string;
  duracaoMs: number;
  resultado: 'sucesso' | 'falha';
  qtdItens?: number;
  erro?: string;
  chave?: string;
  /** Só contagens (vínculo automático), nunca descrição ou CNPJ. */
  contagens?: Record<string, number>;
}

export type Logger = Pick<typeof logger, 'info' | 'warn'>;

/**
 * Log estruturado sem dados pessoais (RNF-30): da chave só vão os 6 primeiros dígitos
 * (UF + AAMM); nunca uid, CNPJ ou chave completa.
 */
export function logImportacao(r: RegistroImportacao, log: Logger = logger): void {
  const { chave, ...resto } = r;
  const registro = { ...resto, ...(chave ? { chavePrefixo: chave.slice(0, 6) } : {}) };
  if (r.resultado === 'sucesso') log.info('importacao', registro);
  else log.warn('importacao', registro);
}
