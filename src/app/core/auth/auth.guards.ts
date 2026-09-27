import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthStore } from './auth.store';

function quandoPronto<T>(decidir: (store: AuthStore, router: Router) => T) {
  const store = inject(AuthStore);
  const router = inject(Router);
  return toObservable(store.pronto).pipe(
    filter(Boolean),
    take(1),
    map(() => decidir(store, router)),
  );
}

export const authGuard: CanActivateFn = (_route, state) =>
  quandoPronto((store, router) =>
    store.logado()
      ? true
      : router.createUrlTree(['/login'], { queryParams: { voltar: state.url } }),
  );

export const guestGuard: CanActivateFn = () =>
  quandoPronto((store, router) => (store.logado() ? router.createUrlTree(['/']) : true));
