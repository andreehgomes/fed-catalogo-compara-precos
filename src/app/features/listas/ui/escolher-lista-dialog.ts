import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import type { Lista } from '../lista';

export interface DadosEscolherLista {
  listas: readonly Lista[];
  podeCriar: boolean;
  titulo?: string;
  confirmar?: string;
}

export type EscolhaDeLista = { id: string } | { nova: true };

const NOVA = '__nova__';

@Component({
  selector: 'cp-escolher-lista-dialog',
  imports: [MatDialogModule],
  template: `
    <form class="escolher" (submit)="$event.preventDefault(); confirmar()">
      <h2 mat-dialog-title class="cp-section-title" id="escolher-titulo">
        {{ dados.titulo ?? 'Adicionar a qual lista?' }}
      </h2>
      <div class="cp-list escolher-opcoes" role="radiogroup" aria-labelledby="escolher-titulo">
        @for (l of dados.listas; track l.id) {
          <label class="escolher-opcao">
            <input
              type="radio"
              name="lista"
              [value]="l.id"
              [checked]="escolha() === l.id"
              (change)="escolha.set(l.id)"
            />
            <span>
              <span class="item-nome">{{ l.nome }}</span>
              <span class="item-detalhe"
                >{{ l.qtdItens }} {{ l.qtdItens === 1 ? 'item' : 'itens' }}</span
              >
            </span>
          </label>
        }
        @if (dados.podeCriar) {
          <label class="escolher-opcao">
            <input
              type="radio"
              name="lista"
              [value]="nova"
              [checked]="escolha() === nova"
              (change)="escolha.set(nova)"
            />
            <span class="item-nome">Nova lista</span>
          </label>
        }
      </div>
      <div class="cp-form-actions">
        <button type="button" class="cp-btn-secondary" mat-dialog-close>Cancelar</button>
        <button type="submit" class="cp-btn-primary">{{ dados.confirmar ?? 'Adicionar' }}</button>
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
export class EscolherListaDialog {
  protected readonly dados = inject<DadosEscolherLista>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EscolherListaDialog, EscolhaDeLista>);

  protected readonly nova = NOVA;
  protected readonly escolha = signal(this.dados.listas[0]?.id ?? NOVA);

  protected confirmar(): void {
    const e = this.escolha();
    this.ref.close(e === NOVA ? { nova: true } : { id: e });
  }
}
