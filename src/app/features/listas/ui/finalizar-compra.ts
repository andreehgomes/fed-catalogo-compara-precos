import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { AcaoFinalizacao } from '../lista';

export type DestinoDaLista = AcaoFinalizacao | 'outra-nota';

let sequencia = 0;

/** RF-13: o destino da lista depois que a compra virou nota. */
@Component({
  selector: 'cp-finalizar-compra',
  imports: [MatIconModule],
  template: `
    <section class="cp-block finalizar" [attr.aria-labelledby]="id">
      <h2 class="cp-section-title" [id]="id">{{ titulo() }}</h2>
      <p class="cp-field-hint">
        Guardada, a lista volta desmarcada e lembra os produtos que você comprou.
      </p>
      <div class="finalizar-acoes">
        <button type="button" class="cp-btn-primary" (click)="escolher.emit('excluir')">
          <mat-icon aria-hidden="true">delete</mat-icon>
          Excluir lista
        </button>
        <button type="button" class="cp-btn-secondary" (click)="escolher.emit('guardar')">
          <mat-icon aria-hidden="true">bookmark_add</mat-icon>
          Guardar para usar de novo
        </button>
        @if (temFaltantes()) {
          <button type="button" class="cp-btn-secondary" (click)="escolher.emit('so-faltou')">
            <mat-icon aria-hidden="true">playlist_remove</mat-icon>
            Manter só o que faltou
          </button>
          @if (podeLerOutra()) {
            <button type="button" class="cp-btn-ghost" (click)="escolher.emit('outra-nota')">
              <mat-icon aria-hidden="true">qr_code_scanner</mat-icon>
              Ler outra nota
            </button>
          }
        }
      </div>
    </section>
  `,
  styles: `
    .finalizar p {
      margin: 0;
    }

    .finalizar-acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinalizarCompra {
  readonly titulo = input('A compra virou nota. E a lista?');
  readonly temFaltantes = input(false);
  /** Compra em outro mercado: só enquanto a lista tem menos de 3 notas. */
  readonly podeLerOutra = input(false);
  readonly escolher = output<DestinoDaLista>();

  protected readonly id = `finalizar-${++sequencia}`;
}
