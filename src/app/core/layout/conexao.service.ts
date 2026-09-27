import { DOCUMENT, Injectable, Signal, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { fromEvent, map, merge } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConexaoService {
  private readonly janela = inject(DOCUMENT).defaultView;

  readonly online: Signal<boolean> = this.janela
    ? toSignal(
        merge(
          fromEvent(this.janela, 'online').pipe(map(() => true)),
          fromEvent(this.janela, 'offline').pipe(map(() => false)),
        ),
        { initialValue: this.janela.navigator.onLine },
      )
    : signal(true).asReadonly();
}
