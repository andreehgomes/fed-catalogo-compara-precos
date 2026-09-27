import { Routes } from '@angular/router';
import { previewGuard } from './preview-nota/preview.guard';

export const IMPORTAR_ROUTES: Routes = [
  {
    path: '',
    title: 'Importar nota · Compara Preços',
    loadComponent: () => import('./importar.page'),
  },
  {
    path: 'preview',
    title: 'Prévia da nota · Compara Preços',
    canActivate: [previewGuard],
    loadComponent: () => import('./preview-nota/preview-nota.page'),
  },
];
