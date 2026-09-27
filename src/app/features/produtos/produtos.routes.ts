import { Routes } from '@angular/router';

export const PRODUTOS_ROUTES: Routes = [
  {
    path: '',
    title: 'Produtos · Compara Preços',
    loadComponent: () => import('./busca/produtos-busca.page'),
  },
  {
    path: ':id',
    title: 'Produto · Compara Preços',
    loadComponent: () => import('./detalhe/produto-detalhe.page'),
  },
];
