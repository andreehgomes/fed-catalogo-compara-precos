import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guards';
import { AUTH_ROUTES } from './features/auth/auth.routes';

const emBreve = () => import('./features/em-breve/em-breve.page');

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
        data: { secao: 'Painel' },
        loadComponent: emBreve,
      },
      {
        path: 'importar',
        title: 'Importar nota · Compara Preços',
        data: { secao: 'Importar nota' },
        loadComponent: emBreve,
      },
      {
        path: 'importar/preview',
        title: 'Prévia da nota · Compara Preços',
        data: { secao: 'Prévia da nota' },
        loadComponent: emBreve,
      },
      {
        path: 'notas',
        title: 'Minhas notas · Compara Preços',
        data: { secao: 'Minhas notas' },
        loadComponent: emBreve,
      },
      {
        path: 'notas/:chave',
        title: 'Nota · Compara Preços',
        data: { secao: 'Nota' },
        loadComponent: emBreve,
      },
      {
        path: 'regiao',
        title: 'Preços perto de mim · Compara Preços',
        loadComponent: () => import('./features/regiao/busca-regiao.page'),
      },
      {
        path: 'produtos',
        title: 'Produtos · Compara Preços',
        data: { secao: 'Produtos' },
        loadComponent: emBreve,
      },
      {
        path: 'produtos/:id',
        title: 'Produto · Compara Preços',
        data: { secao: 'Produto' },
        loadComponent: emBreve,
      },
      {
        path: 'estabelecimentos',
        title: 'Estabelecimentos · Compara Preços',
        data: { secao: 'Estabelecimentos' },
        loadComponent: emBreve,
      },
      {
        path: 'estabelecimentos/:cnpj',
        title: 'Estabelecimento · Compara Preços',
        data: { secao: 'Estabelecimento' },
        loadComponent: emBreve,
      },
    ],
  },
  {
    path: '**',
    title: 'Página não encontrada · Compara Preços',
    loadComponent: () => import('./features/erro/erro.page'),
  },
];
