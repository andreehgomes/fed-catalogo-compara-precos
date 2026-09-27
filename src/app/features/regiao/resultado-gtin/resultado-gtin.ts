import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { separarDivergentes } from '@shared/index';
import { OfertaRegiao } from '../data-access/regiao.model';
import { OfertaRow } from '../ui/oferta-row';

export function porPreco(a: OfertaRegiao, b: OfertaRegiao): number {
  return a.valor - b.valor || a.distanciaKm - b.distanciaKm;
}

@Component({
  selector: 'cp-resultado-gtin',
  imports: [MatIconModule, OfertaRow],
  template: `
    <ul class="cp-list" aria-label="Ofertas com este código de barras">
      @for (o of coerentes(); track o.id; let i = $index) {
        <li><cp-oferta-row [oferta]="o" [menor]="i === 0" /></li>
      }
    </ul>

    @if (divergentes().length) {
      @if (mostrarDivergentes()) {
        <div class="cp-info-block cp-info-block--warn" role="note">
          <mat-icon aria-hidden="true">report</mat-icon>
          A descrição destes itens não combina com o produto. O mercado pode ter cadastrado o código
          de barras errado.
        </div>
        <ul class="cp-list" aria-label="Ofertas com descrição diferente">
          @for (o of divergentes(); track o.id) {
            <li><cp-oferta-row [oferta]="o" /></li>
          }
        </ul>
      }
      <button
        type="button"
        class="cp-btn-ghost"
        [attr.aria-expanded]="mostrarDivergentes()"
        (click)="mostrarDivergentes.set(!mostrarDivergentes())"
      >
        {{
          mostrarDivergentes()
            ? 'Ocultar resultados com descrição diferente'
            : 'Mostrar ' + divergentes().length + ' resultados com descrição diferente'
        }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultadoGtin {
  readonly ofertas = input.required<readonly OfertaRegiao[]>();

  protected readonly mostrarDivergentes = signal(false);
  private readonly separado = computed(() =>
    separarDivergentes(this.ofertas(), (o) => o.descricao),
  );
  readonly coerentes = computed(() => [...this.separado().coerentes].sort(porPreco));
  readonly divergentes = computed(() => [...this.separado().divergentes].sort(porPreco));
}
