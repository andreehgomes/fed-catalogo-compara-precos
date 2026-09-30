import { Routes } from '@angular/router';

export const LISTAS_ROUTES: Routes = [
  {
    path: '',
    title: 'Listas de compras · Cupom Esperto',
    loadComponent: () => import('./minhas-listas/minhas-listas.page'),
  },
  {
    path: ':id',
    title: 'Lista de compras · Cupom Esperto',
    loadComponent: () => import('./lista/lista.page'),
  },
  {
    path: ':id/conferir',
    title: 'Conferir nota · Cupom Esperto',
    loadComponent: () => import('./conferencia/conferencia.page'),
  },
];
