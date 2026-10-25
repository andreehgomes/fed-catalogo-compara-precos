import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GastoMercado, Mes, filtroDoMes } from '../painel.calculos';

@Component({
  selector: 'cp-gasto-por-mercado',
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    @if (mercados().length) {
      <section class="cp-block" aria-labelledby="gasto-mercado-titulo">
        <h2 id="gasto-mercado-titulo" class="cp-section-title">Onde você gastou</h2>
        <ul class="cp-list" aria-label="Gasto por mercado">
          @for (m of mercados(); track m.cnpj ?? 'outros') {
            <li>
              <a class="cp-list-row" routerLink="/notas" [queryParams]="filtro(m.cnpj)">
                <span class="item-principal">
                  <span class="item-nome">{{ m.nome }}</span>
                  <span class="item-detalhe">
                    {{ m.qtdNotas }} {{ m.qtdNotas === 1 ? 'nota' : 'notas' }} ·
                    {{ m.percentual | number: '1.0-1' }}% do mês
                  </span>
                  <span class="barra" aria-hidden="true">
                    <span [style.width.%]="m.percentual"></span>
                  </span>
                </span>
                <span class="cp-price">{{ m.total | currency }}</span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styleUrl: './gasto-por-mercado.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GastoPorMercado {
  readonly mercados = input.required<GastoMercado[]>();
  readonly mes = input.required<Mes>();

  private readonly periodo = computed(() => filtroDoMes(this.mes()));

  /** "Outros" leva às notas do mês, sem filtro de mercado. */
  protected filtro(cnpj: string | null) {
    return cnpj ? { ...this.periodo(), cnpj } : this.periodo();
  }
}
