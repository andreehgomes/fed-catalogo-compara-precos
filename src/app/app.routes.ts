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
        title: 'Painel · Cupom Esperto',
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
        path: 'sugestoes',
        loadChildren: () =>
          import('./features/sugestoes/sugestoes.routes').then((m) => m.SUGESTOES_ROUTES),
      },
      {
        path: 'listas',
        loadChildren: () => import('./features/listas/listas.routes').then((m) => m.LISTAS_ROUTES),
      },
      {
        path: 'regiao',
        title: 'Preços perto de mim · Cupom Esperto',
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
    title: 'Página não encontrada · Cupom Esperto',
    loadComponent: () => import('./features/erro/erro.page'),
  },
];
