import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';

@Component({
  selector: 'cp-em-breve',
  imports: [EmptyState],
  template: `
    <main class="cp-page">
      <header class="cp-page-header">
        <h1>{{ secao() }}</h1>
      </header>
      <cp-empty-state
        icone="construction"
        titulo="Em breve"
        texto="Esta tela entra numa próxima etapa."
      />
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class EmBrevePage {
  readonly secao = input('Compara Preços');
}
