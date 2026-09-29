import { Routes } from '@angular/router';

export const NOTAS_ROUTES: Routes = [
  {
    path: '',
    title: 'Minhas notas · Cupom Esperto',
    loadComponent: () => import('./lista/notas-lista.page'),
  },
  {
    path: ':chave',
    title: 'Nota · Cupom Esperto',
    loadComponent: () => import('./detalhe/nota-detalhe.page'),
  },
];
