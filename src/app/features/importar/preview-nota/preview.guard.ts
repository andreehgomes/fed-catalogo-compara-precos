import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ImportarStore } from '../importar.store';

/** Sem prévia no store (refresh, link direto), volta para Importar. */
export const previewGuard: CanActivateFn = () =>
  inject(ImportarStore).nota() ? true : inject(Router).createUrlTree(['/importar']);
