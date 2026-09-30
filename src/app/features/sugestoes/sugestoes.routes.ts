import { Routes } from '@angular/router';

export const SUGESTOES_ROUTES: Routes = [
  {
    path: '',
    title: 'Sugestão de compra · Cupom Esperto',
    loadComponent: () => import('./sugestoes.page'),
  },
];
