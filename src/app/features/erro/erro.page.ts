import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';

@Component({
  selector: 'cp-erro',
  imports: [EmptyState, RouterLink],
  template: `
    <main class="cp-page cp-page--form">
      <cp-empty-state
        icone="explore_off"
        titulo="Página não encontrada"
        texto="O endereço pode ter mudado ou não existir mais."
      >
        <a class="cp-btn-primary" routerLink="/">Ir para o painel</a>
      </cp-empty-state>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ErroPage {}
