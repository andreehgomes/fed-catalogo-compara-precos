import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Saldo contra o melhor preço recente: positivo gastou a mais, negativo economizou. */
@Component({
  selector: 'cp-saldo-nota',
  imports: [CurrencyPipe, MatIconModule],
  template: `
    <span
      class="saldo"
      [class.saldo--mais-caro]="saldo() > 0"
      [class.saldo--mais-barato]="saldo() < 0"
      [class.saldo--grande]="grande()"
    >
      <mat-icon aria-hidden="true">{{ icone() }}</mat-icon>
      @if (saldo() === 0) {
        Saldo zerado
      } @else {
        {{ absoluto() | currency }} {{ saldo() > 0 ? 'a mais' : 'de economia' }}
      }
    </span>
  `,
  styleUrl: './saldo-nota.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaldoNota {
  readonly saldo = input.required<number>();
  readonly grande = input(false);

  protected readonly absoluto = computed(() => Math.abs(this.saldo()));
  protected readonly icone = computed(() =>
    this.saldo() > 0 ? 'trending_up' : this.saldo() < 0 ? 'trending_down' : 'check',
  );
}
