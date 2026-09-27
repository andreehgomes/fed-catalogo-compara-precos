import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'cp-empty-state',
  imports: [MatIconModule],
  template: `
    <div class="cp-empty-state">
      <span class="cp-empty-icon"><mat-icon aria-hidden="true">{{ icone() }}</mat-icon></span>
      <h2 class="cp-empty-title">{{ titulo() }}</h2>
      @if (texto()) {
        <p>{{ texto() }}</p>
      }
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly titulo = input.required<string>();
  readonly icone = input('inbox');
  readonly texto = input<string | null>(null);
}
