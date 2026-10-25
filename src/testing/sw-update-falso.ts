import { Provider } from '@angular/core';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { RECARREGAR_PAGINA } from '../app/core/atualizacao/atualizacao.service';

export class SwUpdateFalso {
  isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<UnrecoverableStateEvent>();
  readonly checkForUpdate = vi.fn(async () => false);
  readonly activateUpdate = vi.fn(async () => true);

  versaoPronta(): void {
    this.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'antiga' },
      latestVersion: { hash: 'nova' },
    });
  }
}

export function provideSwUpdateFalso(sw = new SwUpdateFalso(), recarregar = vi.fn()): Provider[] {
  return [
    { provide: SwUpdate, useValue: sw },
    { provide: RECARREGAR_PAGINA, useValue: recarregar },
  ];
}
