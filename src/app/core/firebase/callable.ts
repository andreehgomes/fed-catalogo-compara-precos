import { InjectionToken, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FUNCTIONS } from './functions.token';

export type ChamarFunction = <T>(nome: string, dados: unknown) => Promise<T>;

/** Chama uma callable pelo nome. Token para os testes trocarem o SDK por um fake. */
export const CHAMAR_FUNCTION = new InjectionToken<ChamarFunction>('CHAMAR_FUNCTION', {
  providedIn: 'root',
  factory: () => {
    const functions = inject(FUNCTIONS);
    return async <T>(nome: string, dados: unknown) =>
      (await httpsCallable<unknown, T>(functions, nome)(dados)).data;
  },
});
