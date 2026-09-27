import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DadosConfirmacao {
  titulo: string;
  mensagem: string;
  confirmar: string;
  cancelar?: string;
  perigo?: boolean;
}

@Component({
  selector: 'cp-confirm-dialog',
  imports: [MatDialogModule],
  template: `
    <div class="confirmacao">
      <h2 mat-dialog-title class="cp-section-title">{{ dados.titulo }}</h2>
      <p>{{ dados.mensagem }}</p>
      <div class="cp-form-actions">
        <button type="button" class="cp-btn-secondary" [mat-dialog-close]="false">
          {{ dados.cancelar ?? 'Cancelar' }}
        </button>
        <button
          type="button"
          [class]="dados.perigo ? 'cp-btn-danger' : 'cp-btn-primary'"
          [mat-dialog-close]="true"
        >
          {{ dados.confirmar }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .confirmacao {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 22px;
    }

    h2 {
      margin: 0;
      padding: 0;
      font-size: 18px;
    }

    p {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly dados = inject<DadosConfirmacao>(MAT_DIALOG_DATA);
}
