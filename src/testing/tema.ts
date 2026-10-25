import { Provider, WritableSignal, signal } from '@angular/core';
import {
  ARMAZENAMENTO_TEMA,
  ArmazenamentoTema,
  PREFERE_ESCURO,
} from '../app/core/tema/tema-ambiente';

export class ArmazenamentoFalso implements ArmazenamentoTema {
  readonly dados = new Map<string, string>();

  getItem(chave: string): string | null {
    return this.dados.get(chave) ?? null;
  }

  setItem(chave: string, valor: string): void {
    this.dados.set(chave, valor);
  }

  removeItem(chave: string): void {
    this.dados.delete(chave);
  }
}

export interface TemaFalso {
  armazenamento: ArmazenamentoFalso;
  prefereEscuro: WritableSignal<boolean>;
  providers: Provider[];
}

export function temaFalso(
  inicial: { salvo?: string; sistemaEscuro?: boolean } = {},
  armazenamento: ArmazenamentoTema | null = new ArmazenamentoFalso(),
): TemaFalso {
  if (inicial.salvo !== undefined) armazenamento?.setItem('cp-tema', inicial.salvo);
  const prefereEscuro = signal(inicial.sistemaEscuro ?? false);
  return {
    armazenamento: armazenamento as ArmazenamentoFalso,
    prefereEscuro,
    providers: [
      { provide: ARMAZENAMENTO_TEMA, useValue: armazenamento },
      { provide: PREFERE_ESCURO, useValue: prefereEscuro },
    ],
  };
}
