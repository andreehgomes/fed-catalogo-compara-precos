import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type TipoBadgePreco = 'mais-barato' | 'mais-caro' | 'igual';

const ICONES: Record<TipoBadgePreco, string> = {
  'mais-barato': 'trending_down',
  'mais-caro': 'trending_up',
  igual: 'check',
};

@Component({
  selector: 'cp-badge-preco',
  imports: [CurrencyPipe, MatIconModule],
  template: `
    <span [class]="'cp-badge cp-badge--' + tipo()">
      <mat-icon aria-hidden="true">{{ icone() }}</mat-icon>
      @if (rotulo(); as r) {
        {{ r }}
      } @else {
        @switch (tipo()) {
          @case ('mais-barato') {
            @if (diferenca(); as d) {
              {{ d | currency }} mais barato
            } @else {
              Mais barato
            }
          }
          @case ('mais-caro') {
            @if (diferenca(); as d) {
              {{ d | currency }} mais caro
            } @else {
              Mais caro
            }
          }
          @default {
            {{ textoIgual() }}
          }
        }
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgePreco {
  readonly tipo = input.required<TipoBadgePreco>();
  readonly diferenca = input<number | null>(null);
  readonly textoIgual = input('Mesmo preço');
  readonly rotulo = input<string | null>(null);

  protected readonly icone = computed(() => ICONES[this.tipo()]);
}
