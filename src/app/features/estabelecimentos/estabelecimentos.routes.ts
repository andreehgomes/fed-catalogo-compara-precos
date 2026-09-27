import { Routes } from '@angular/router';

export const ESTABELECIMENTOS_ROUTES: Routes = [
  {
    path: '',
    title: 'Estabelecimentos · Compara Preços',
    loadComponent: () => import('./lista/estabelecimentos-lista.page'),
  },
  {
    path: ':cnpj',
    title: 'Estabelecimento · Compara Preços',
    loadComponent: () => import('./detalhe/estabelecimento-detalhe.page'),
  },
];
