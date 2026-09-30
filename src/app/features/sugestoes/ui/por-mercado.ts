import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Cesta, GrupoPorMercado } from '../sugestao';

@Component({
  selector: 'cp-por-mercado',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <section class="pm-grupos" aria-labelledby="pm-grupos-titulo">
      <h2 class="cp-section-title" id="pm-grupos-titulo">Onde cada item saiu mais barato</h2>
      <p class="pm-nota">Pelo último preço que você pagou em cada mercado.</p>
      @for (g of grupos(); track g.cnpj) {
        <article class="cp-card pm-card" [attr.aria-labelledby]="'pm-' + g.cnpj">
          <header>
            <h3 [id]="'pm-' + g.cnpj">{{ g.mercado }}</h3>
            <span class="item-detalhe">
              {{ g.itens.length }} {{ g.itens.length === 1 ? 'item' : 'itens' }} ·
              <strong class="cp-price">{{ g.total | currency }}</strong>
            </span>
          </header>
          <ul class="cp-list">
            @for (i of g.itens; track i.grupo) {
              <li class="cp-list-row">
                <span class="item-principal">
                  <span class="item-nome">{{ i.descricao }}</span>
                  <span class="item-detalhe"
                    >≈ {{ i.quantidade | number: '1.0-3' }} {{ i.unidade }}</span
                  >
                </span>
                @if (i.subtotal !== null) {
                  <span class="cp-price">{{ i.subtotal | currency }}</span>
                } @else {
                  <span class="item-detalhe">sem preço comparável</span>
                }
              </li>
            }
          </ul>
        </article>
      }
      <p class="pm-total" role="status">
        Comprando cada item onde saiu mais barato:
        <strong>{{ totalGeral() | currency }}</strong> em {{ grupos().length }}
        {{ grupos().length === 1 ? 'mercado' : 'mercados' }}
      </p>
    </section>

    <aside class="pm-cestas" aria-labelledby="pm-cestas-titulo">
      <h2 class="cp-section-title" id="pm-cestas-titulo">Um mercado só</h2>
      <p class="pm-nota">Se quiser comprar tudo num lugar, onde você já comprou mais itens.</p>
      @for (c of cestas(); track c.cnpj) {
        <article class="cp-card pm-card" [attr.aria-labelledby]="'pc-' + c.cnpj">
          <header>
            <h3 [id]="'pc-' + c.cnpj">{{ c.mercado }}</h3>
            <strong class="cp-price">{{ c.total | currency }}</strong>
          </header>
          <p class="item-detalhe">{{ c.cobertos.length }} de {{ totalItens() }} itens</p>
          @if (c.faltando.length) {
            <p class="item-detalhe">Faltam: {{ c.faltando.join(', ') }}</p>
          }
        </article>
      }
    </aside>
  `,
  styleUrl: './por-mercado.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PorMercado {
  readonly grupos = input.required<GrupoPorMercado[]>();
  readonly cestas = input.required<Cesta[]>();

  protected readonly totalItens = computed(() =>
    this.grupos().reduce((s, g) => s + g.itens.length, 0),
  );
  protected readonly totalGeral = computed(
    () => Math.round(this.grupos().reduce((s, g) => s + g.total, 0) * 100) / 100,
  );
}
