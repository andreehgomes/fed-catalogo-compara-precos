import { DEFAULT_CURRENCY_CODE, LOCALE_ID, Provider } from '@angular/core';

export default [
  { provide: LOCALE_ID, useValue: 'pt-BR' },
  { provide: DEFAULT_CURRENCY_CODE, useValue: 'BRL' },
] satisfies Provider[];
