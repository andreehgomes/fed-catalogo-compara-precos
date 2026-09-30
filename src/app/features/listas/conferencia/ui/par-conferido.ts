import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { VinculoItemLista } from '@shared/model';
import { Preco } from '../../../../shared/ui/preco/preco';

export interface LadoDaNota {
  descricao: string;
  qtd: number;
  unidade: string;
  vlTotal: number;
}

/** Item da lista ↔ item da nota. As ações entram por projeção. */
@Component({
  selector: 'cp-par-conferido',
  imports: [DecimalPipe, MatIconModule, Preco],
  template: `
    <div class="par">
      <div class="item-principal">
        @if (texto(); as t) {
          <span class="item-nome">{{ t }}</span>
        }
        @if (nota(); as n) {
          <span class="item-detalhe">
            @if (texto()) {
              <span class="cp-sr-only">na nota como</span>
              <mat-icon class="par-seta" aria-hidden="true">subdirectory_arrow_right</mat-icon>
            }
            {{ n.descricao }} · {{ n.qtd | number: '1.0-3' }} {{ n.unidade }}
          </span>
        }
        @if (como() === 'texto') {
          <span class="cp-chip par-aproximado">
            <mat-icon aria-hidden="true">compare_arrows</mat-icon>
            aproximado
          </span>
        }
        <div class="par-acoes"><ng-content /></div>
      </div>
      @if (nota(); as n) {
        <div class="item-lado">
          <cp-preco [valor]="n.vlTotal" />
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .par {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .par-seta {
      width: 16px;
      height: 16px;
      font-size: 16px;
      vertical-align: -3px;
    }

    .par-aproximado {
      align-self: flex-start;
    }

    .par-acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;

      &:empty {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParConferido {
  readonly texto = input<string | null>(null);
  readonly nota = input<LadoDaNota | null>(null);
  readonly como = input<VinculoItemLista['como'] | null>(null);
}
