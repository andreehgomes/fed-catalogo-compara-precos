import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guards';
import { AUTH_ROUTES } from './features/auth/auth.routes';

export const routes: Routes = [
  ...AUTH_ROUTES,
  {
    path: '',
    loadComponent: () => import('./core/layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Painel · Compara Preços',
        loadComponent: () => import('./features/painel/painel.page'),
      },
      {
        path: 'importar',
        loadChildren: () =>
          import('./features/importar/importar.routes').then((m) => m.IMPORTAR_ROUTES),
      },
      {
        path: 'notas',
        loadChildren: () => import('./features/notas/notas.routes').then((m) => m.NOTAS_ROUTES),
      },
      {
        path: 'regiao',
        title: 'Preços perto de mim · Compara Preços',
        loadComponent: () => import('./features/regiao/busca-regiao.page'),
      },
      {
        path: 'produtos',
        loadChildren: () =>
          import('./features/produtos/produtos.routes').then((m) => m.PRODUTOS_ROUTES),
      },
      {
        path: 'estabelecimentos',
        loadChildren: () =>
          import('./features/estabelecimentos/estabelecimentos.routes').then(
            (m) => m.ESTABELECIMENTOS_ROUTES,
          ),
      },
    ],
  },
  {
    path: '**',
    title: 'Página não encontrada · Compara Preços',
    loadComponent: () => import('./features/erro/erro.page'),
  },
];
