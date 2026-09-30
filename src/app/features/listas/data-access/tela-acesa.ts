import {
  DOCUMENT,
  DestroyRef,
  InjectionToken,
  Signal,
  effect,
  inject,
  signal,
} from '@angular/core';

export interface TravaDeTela {
  release(): Promise<void>;
}

export interface WakeLockApi {
  request(tipo: 'screen'): Promise<TravaDeTela>;
}

/** `navigator.wakeLock` (Screen Wake Lock), ou `null` sem suporte; os testes trocam por fake. */
export const WAKE_LOCK = new InjectionToken<WakeLockApi | null>('WAKE_LOCK', {
  providedIn: 'root',
  factory: () =>
    (inject(DOCUMENT).defaultView?.navigator as { wakeLock?: WakeLockApi } | undefined)?.wakeLock ??
    null,
});

/**
 * D-07: mantém a tela acesa enquanto `ativo()` e a aba está visível; solta ao ocultar a aba, ao
 * `ativo()` ficar falso e ao destruir quem chamou. Chamar no contexto de injeção da página.
 */
export function manterTelaAcesa(ativo: Signal<boolean>): void {
  const wakeLock = inject(WAKE_LOCK);
  if (!wakeLock) return;
  const doc = inject(DOCUMENT);
  const visivel = signal(doc.visibilityState !== 'hidden');
  const aoMudar = () => visivel.set(doc.visibilityState !== 'hidden');
  doc.addEventListener('visibilitychange', aoMudar);

  let trava: TravaDeTela | null = null;
  let pedido = 0;
  const soltar = () => {
    pedido++;
    const t = trava;
    trava = null;
    t?.release().catch(() => undefined);
  };

  effect(() => {
    if (!ativo() || !visivel()) {
      soltar();
      return;
    }
    const meu = ++pedido;
    wakeLock
      .request('screen')
      .then((t) => {
        if (meu === pedido) trava = t;
        else t.release().catch(() => undefined);
      })
      .catch(() => undefined);
  });

  inject(DestroyRef).onDestroy(() => {
    doc.removeEventListener('visibilitychange', aoMudar);
    soltar();
  });
}
