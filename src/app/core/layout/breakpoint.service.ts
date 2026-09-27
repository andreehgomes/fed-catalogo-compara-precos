import { DOCUMENT, Injectable, Signal, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { fromEvent, map } from 'rxjs';

export const CONSULTA_ESTREITO = '(max-width: 900px)';

@Injectable({ providedIn: 'root' })
export class BreakpointService {
  private readonly janela = inject(DOCUMENT).defaultView;

  readonly estreito: Signal<boolean> = this.observar(CONSULTA_ESTREITO);

  private observar(consulta: string): Signal<boolean> {
    const mql = this.janela?.matchMedia?.(consulta);
    if (!mql) return signal(false).asReadonly();
    return toSignal(fromEvent<MediaQueryListEvent>(mql, 'change').pipe(map((e) => e.matches)), {
      initialValue: mql.matches,
    });
  }
}
