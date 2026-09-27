import { Routes } from '@angular/router';

export const NOTAS_ROUTES: Routes = [
  {
    path: '',
    title: 'Minhas notas · Compara Preços',
    loadComponent: () => import('./lista/notas-lista.page'),
  },
  {
    path: ':chave',
    title: 'Nota · Compara Preços',
    loadComponent: () => import('./detalhe/nota-detalhe.page'),
  },
];
