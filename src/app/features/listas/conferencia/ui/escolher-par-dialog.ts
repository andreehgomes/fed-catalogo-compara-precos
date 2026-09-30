import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface OpcaoDePar {
  id: string;
  rotulo: string;
  detalhe?: string;
}

export interface DadosEscolherPar {
  titulo: string;
  opcoes: readonly OpcaoDePar[];
}

@Component({
  selector: 'cp-escolher-par-dialog',
  imports: [MatDialogModule],
  template: `
    <form class="escolher" (submit)="$event.preventDefault(); ligar()">
      <h2 mat-dialog-title class="cp-section-title" id="escolher-par-titulo">{{ dados.titulo }}</h2>
      <div class="cp-list escolher-opcoes" role="radiogroup" aria-labelledby="escolher-par-titulo">
        @for (o of dados.opcoes; track o.id) {
          <label class="escolher-opcao">
            <input
              type="radio"
              name="par"
              [value]="o.id"
              [checked]="escolha() === o.id"
              (change)="escolha.set(o.id)"
            />
            <span>
              <span class="item-nome">{{ o.rotulo }}</span>
              @if (o.detalhe) {
                <span class="item-detalhe">{{ o.detalhe }}</span>
              }
            </span>
          </label>
        }
      </div>
      <div class="cp-form-actions">
        <button type="button" class="cp-btn-secondary" mat-dialog-close>Cancelar</button>
        <button type="submit" class="cp-btn-primary" [disabled]="!escolha()">Ligar</button>
      </div>
    </form>
  `,
  styles: `
    .escolher {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 22px;
    }

    h2 {
      margin: 0;
      padding: 0;
    }

    .escolher-opcoes {
      display: flex;
      flex-direction: column;
      max-height: 55vh;
      overflow-y: auto;
    }

    .escolher-opcao {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 48px;
      cursor: pointer;

      > span {
        display: flex;
        flex-direction: column;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EscolherParDialog {
  protected readonly dados = inject<DadosEscolherPar>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EscolherParDialog, string>);

  protected readonly escolha = signal<string | null>(null);

  protected ligar(): void {
    const e = this.escolha();
    if (e) this.ref.close(e);
  }
}
