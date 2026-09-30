import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SugestoesStore } from '../sugestoes/data-access/sugestoes.store';

@Component({
  selector: 'cp-hora-de-repor',
  imports: [MatIconModule, RouterLink],
  template: `
    @if (itens().length) {
      <section class="cp-block" aria-labelledby="hora-de-repor-titulo">
        <div class="cp-section-top">
          <h2 class="cp-section-title" id="hora-de-repor-titulo">Hora de repor</h2>
          <a class="cp-btn-ghost" routerLink="/sugestoes">Ver sugestão completa</a>
        </div>
        <ul class="cp-list" aria-label="Hora de repor">
          @for (s of itens(); track s.grupo) {
            <li class="cp-list-row">
              <mat-icon aria-hidden="true">schedule</mat-icon>
              <span class="item-principal">
                <span class="item-nome">{{ s.descricao }}</span>
                <span class="item-detalhe">
                  comprou há {{ s.diasDesdeUltima }} {{ s.diasDesdeUltima === 1 ? 'dia' : 'dias' }}
                </span>
              </span>
            </li>
          }
        </ul>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoraDeRepor {
  private readonly store = inject(SugestoesStore);

  protected readonly itens = computed(() => (this.store.erro() ? [] : this.store.horaDeRepor()));
}
