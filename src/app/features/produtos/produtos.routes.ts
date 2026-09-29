import { Routes } from '@angular/router';

export const PRODUTOS_ROUTES: Routes = [
  {
    path: '',
    title: 'Produtos · Cupom Esperto',
    loadComponent: () => import('./busca/produtos-busca.page'),
  },
  {
    path: ':id',
    title: 'Produto · Cupom Esperto',
    loadComponent: () => import('./detalhe/produto-detalhe.page'),
  },
];
