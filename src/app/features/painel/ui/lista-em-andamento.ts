import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ListasStore } from '../../listas/data-access/listas.store';

@Component({
  selector: 'cp-lista-em-andamento',
  imports: [MatIconModule, RouterLink],
  template: `
    @if (listas.emAndamento(); as l) {
      <section class="cp-block" aria-labelledby="lista-andamento-titulo">
        <div class="cp-section-top">
          <h2 class="cp-section-title" id="lista-andamento-titulo">Lista de compras</h2>
          <a class="cp-btn-ghost" routerLink="/listas">Ver listas</a>
        </div>
        <a class="cp-list-row andamento" [routerLink]="['/listas', l.id]">
          <mat-icon aria-hidden="true">checklist</mat-icon>
          <span class="andamento-corpo">
            <span class="andamento-nome">{{ l.nome }}</span>
            <span class="andamento-detalhe">
              {{ l.qtdMarcados }} de {{ l.qtdItens }} {{ l.qtdItens === 1 ? 'item' : 'itens' }}
              no carrinho
            </span>
          </span>
          <span class="cp-btn-secondary-compact" aria-hidden="true">Abrir lista</span>
        </a>
      </section>
    }
  `,
  styles: `
    @use '../../../shared/style/tokens' as *;

    .andamento {
      gap: 12px;
    }

    .andamento-corpo {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .andamento-nome {
      font-size: 14px;
      font-weight: 600;
      color: $cp-text;
    }

    .andamento-detalhe {
      font-size: 12px;
      color: $cp-text-muted;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListaEmAndamento {
  protected readonly listas = inject(ListasStore);
}
