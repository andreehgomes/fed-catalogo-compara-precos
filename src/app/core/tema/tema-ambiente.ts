import { DOCUMENT, InjectionToken, Signal, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { fromEvent, map } from 'rxjs';

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';

/** Mesma chave lida pelo script inline do `index.html`, antes do bootstrap. */
export const CHAVE_TEMA = 'cp-tema';
export const CONSULTA_ESCURO = '(prefers-color-scheme: dark)';

export type ArmazenamentoTema = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const ARMAZENAMENTO_TEMA = new InjectionToken<ArmazenamentoTema | null>(
  'ARMAZENAMENTO_TEMA',
  {
    providedIn: 'root',
    factory: () => {
      try {
        return inject(DOCUMENT).defaultView?.localStorage ?? null;
      } catch {
        return null;
      }
    },
  },
);

export const PREFERE_ESCURO = new InjectionToken<Signal<boolean>>('PREFERE_ESCURO', {
  providedIn: 'root',
  factory: () => {
    const mql = inject(DOCUMENT).defaultView?.matchMedia?.(CONSULTA_ESCURO);
    if (!mql) return signal(false).asReadonly();
    return toSignal(fromEvent<MediaQueryListEvent>(mql, 'change').pipe(map((e) => e.matches)), {
      initialValue: mql.matches,
    });
  },
});
