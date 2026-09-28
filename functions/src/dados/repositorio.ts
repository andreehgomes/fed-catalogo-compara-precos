import type { Pendente, VinculoAuto } from '@shared/model';

export type Dados = Record<string, unknown>;

export interface OpcoesGravacao {
  merge?: boolean;
}

export interface Operacao {
  tipo: 'gravar' | 'apagar';
  caminho: string;
  dados?: Dados;
  opcoes?: OpcoesGravacao;
}

export interface Transacao {
  obter<T>(caminho: string): Promise<T | null>;
  gravar(caminho: string, dados: Dados, opcoes?: OpcoesGravacao): void;
  apagar(caminho: string): void;
}

export interface PendenteVencido {
  uid: string;
  pendente: Pendente;
}

/**
 * Único acesso das regras de negócio ao Firestore. Caminhos são strings
 * (`usuarios/{uid}/notas/{chave}`). Há a implementação real (Admin SDK) e um fake em
 * memória nos testes — o projeto não usa o Emulator Suite.
 */
export interface Repositorio {
  obter<T>(caminho: string): Promise<T | null>;
  obterVarios<T>(caminhos: readonly string[]): Promise<(T | null)[]>;
  gravar(caminho: string, dados: Dados, opcoes?: OpcoesGravacao): Promise<void>;
  apagar(caminho: string): Promise<void>;
  /** Grava em lotes de até 500 operações (limite do Firestore). */
  lote(operacoes: readonly Operacao[]): Promise<void>;
  transacao<R>(fn: (tx: Transacao) => Promise<R>): Promise<R>;
  consultarPendentesVencidos(agora: Date, limite: number): Promise<PendenteVencido[]>;
  consultarVinculosVencidos(agora: Date, limite: number): Promise<VinculoAuto[]>;
  /** Ids de `colecao` em ordem, maiores que `depoisDe` e com o prefixo dado. */
  listarIds(colecao: string, prefixo: string, depoisDe: string, limite: number): Promise<string[]>;
  consultar<T>(
    colecao: string,
    filtros: readonly Filtro[],
  ): Promise<{ caminho: string; dados: T }[]>;
}

export interface Filtro {
  campo: string;
  op: '==';
  valor: unknown;
}

export const LIMITE_LOTE = 500;
