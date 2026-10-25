import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SaldoNota } from '../../../shared/ui/saldo-nota/saldo-nota';
import {
  EscolhaMes,
  Mes,
  ResumoPeriodo,
  VariacaoMes,
  inicioDoMes,
  somarMeses,
} from '../painel.calculos';

@Component({
  selector: 'cp-resumo-mes',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, MatIconModule, SaldoNota],
  template: `
    <section class="cp-block" aria-labelledby="resumo-mes-titulo">
      <div class="cp-section-top">
        <h2 id="resumo-mes-titulo" class="cp-section-title">
          @if (mesAtual()) {
            Resumo do mês
          } @else {
            Resumo de {{ data() | date: 'MMMM' }}
          }
        </h2>
        @if (podeEscolher()) {
          <div class="cp-segmented" role="group" aria-label="Mês do resumo">
            <button
              type="button"
              [attr.aria-pressed]="escolha() === 'atual'"
              (click)="escolher.emit('atual')"
            >
              Este mês
            </button>
            <button
              type="button"
              [attr.aria-pressed]="escolha() === 'anterior'"
              (click)="escolher.emit('anterior')"
            >
              Mês passado
            </button>
          </div>
        }
      </div>
      @if (!mesAtual() && !podeEscolher()) {
        <p class="resumo-aviso">Ainda não há nota este mês: mostrando o último mês com compra.</p>
      }

      <div class="cp-summary">
        <div>
          <span class="cp-summary-label">Gasto</span>
          <span class="cp-summary-value">{{ resumo().total | currency }}</span>
          @if (variacao(); as v) {
            <span class="resumo-detalhe">
              <mat-icon aria-hidden="true">{{
                v.percentual > 0
                  ? 'arrow_upward'
                  : v.percentual < 0
                    ? 'arrow_downward'
                    : 'trending_flat'
              }}</mat-icon>
              {{ v.percentual > 0 ? '+' : '' }}{{ v.percentual | number: '1.0-1' }}% em relação a
              {{ anterior() | date: 'MMMM' }}{{ v.parcial ? ' até o dia ' + v.dia : '' }} ({{
                v.base | currency
              }})
            </span>
          }
        </div>
        <div>
          <span class="cp-summary-label">Saldo contra seu melhor preço</span>
          @if (resumo().comparados) {
            <cp-saldo-nota [saldo]="resumo().saldo" [grande]="true" />
            <span class="resumo-detalhe">
              {{ resumo().aMais | currency }} a mais em {{ resumo().itensAcima }}
              {{ resumo().itensAcima === 1 ? 'item' : 'itens' }} ·
              {{ resumo().economia | currency }} de economia em {{ resumo().itensNovoMelhor }}
              {{ resumo().itensNovoMelhor === 1 ? 'item' : 'itens' }}
            </span>
          } @else {
            <span class="resumo-detalhe">
              Importe mais notas para comparar com os preços que você já pagou.
            </span>
          }
        </div>
        <div>
          <span class="cp-summary-label">Notas</span>
          <span class="cp-summary-value">{{ resumo().qtdNotas }}</span>
          @if (resumo().qtdNotas) {
            <span class="resumo-detalhe">ticket médio {{ resumo().ticketMedio | currency }}</span>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './resumo-mes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumoMes {
  readonly mes = input.required<Mes>();
  readonly mesAtual = input.required<boolean>();
  readonly resumo = input.required<ResumoPeriodo>();
  readonly variacao = input<VariacaoMes | null>(null);
  readonly podeEscolher = input(false);
  readonly escolha = input<EscolhaMes>('atual');
  readonly escolher = output<EscolhaMes>();

  protected readonly data = computed(() => inicioDoMes(this.mes()));
  protected readonly anterior = computed(() => inicioDoMes(somarMeses(this.mes(), -1)));
}
