import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { extrairChave, formatarCnpj } from '@shared/chave-acesso';
import type { Pendente } from '@shared/model';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function mesDaChave(chave: string): string {
  const { anoMes } = extrairChave(chave);
  return `${MESES[Number(anoMes.slice(2, 4)) - 1] ?? '?'}/20${anoMes.slice(0, 2)}`;
}

@Component({
  selector: 'cp-pendente-row',
  imports: [DatePipe, MatIconModule],
  template: `
    <div class="item-principal">
      <span class="item-nome">CNPJ {{ cnpj() }}</span>
      <span class="item-detalhe">Nota de {{ mes() }}</span>
      @if (pendente().status === 'aguardando') {
        <span class="cp-status--aguardando">
          <mat-icon aria-hidden="true">schedule</mat-icon>
          Próxima tentativa às {{ pendente().proximaTentativa | date: 'HH:mm' }}
        </span>
      } @else {
        <span class="cp-status--falhou">
          <mat-icon aria-hidden="true">error</mat-icon>
          Não foi possível importar
        </span>
      }
    </div>
    <div class="item-lado pendente-acoes">
      @if (pendente().status === 'falhou') {
        <button type="button" class="cp-btn-ghost" (click)="retentar.emit(pendente().chave)">
          Tentar de novo
        </button>
      }
      <button
        type="button"
        class="cp-btn-ghost"
        [attr.aria-label]="'Excluir nota pendente de ' + mes()"
        (click)="excluir.emit(pendente().chave)"
      >
        Excluir
      </button>
    </div>
  `,
  styles: `
    .pendente-acoes {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
  `,
  host: { class: 'cp-list-row' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendenteRow {
  readonly pendente = input.required<Pendente>();
  readonly retentar = output<string>();
  readonly excluir = output<string>();

  protected readonly cnpj = computed(() => formatarCnpj(extrairChave(this.pendente().chave).cnpj));
  protected readonly mes = computed(() => mesDaChave(this.pendente().chave));
}
