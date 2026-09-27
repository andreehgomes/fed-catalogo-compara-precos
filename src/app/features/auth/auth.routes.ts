import { Routes } from '@angular/router';
import { guestGuard } from '../../core/auth/auth.guards';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Entrar · Compara Preços',
    loadComponent: () => import('./login/login.page'),
  },
  {
    path: 'cadastro',
    canActivate: [guestGuard],
    title: 'Criar conta · Compara Preços',
    loadComponent: () => import('./cadastro/cadastro.page'),
  },
  {
    path: 'redefinir-senha',
    title: 'Redefinir senha · Compara Preços',
    loadComponent: () => import('./redefinir-senha/redefinir-senha.page'),
  },
];
