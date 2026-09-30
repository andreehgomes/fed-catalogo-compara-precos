import { InjectionToken } from '@angular/core';

/** "Agora" do aparelho; os testes fixam a data. */
export const RELOGIO = new InjectionToken<() => Date>('RELOGIO', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
