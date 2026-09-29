import { Routes } from '@angular/router';

export const ESTABELECIMENTOS_ROUTES: Routes = [
  {
    path: '',
    title: 'Estabelecimentos · Cupom Esperto',
    loadComponent: () => import('./lista/estabelecimentos-lista.page'),
  },
  {
    path: ':cnpj',
    title: 'Estabelecimento · Cupom Esperto',
    loadComponent: () => import('./detalhe/estabelecimento-detalhe.page'),
  },
];
