import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, validate } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { erroDoCampo } from '../../../shared/forms/erro-campo';
import { MAX_NOME } from '../lista';

@Component({
  selector: 'cp-renomear-lista-dialog',
  imports: [FormField, FormRoot, MatDialogModule],
  template: `
    <form class="renomear" [formRoot]="form">
      <h2 mat-dialog-title class="cp-section-title">Nome da lista</h2>
      <label class="cp-field">
        <span>Nome</span>
        <input
          type="text"
          autocomplete="off"
          [formField]="form.nome"
          [attr.aria-invalid]="!!erro()"
          [attr.aria-describedby]="erro() ? 'renomear-lista-erro' : null"
        />
      </label>
      @if (erro(); as msg) {
        <span id="renomear-lista-erro" class="cp-field-error" role="alert">{{ msg }}</span>
      }
      <div class="cp-form-actions">
        <button type="button" class="cp-btn-secondary" mat-dialog-close>Cancelar</button>
        <button type="submit" class="cp-btn-primary">Salvar</button>
      </div>
    </form>
  `,
  styles: `
    .renomear {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 22px;
    }

    h2 {
      margin: 0;
      padding: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenomearListaDialog {
  private readonly ref = inject(MatDialogRef<RenomearListaDialog, string>);

  protected readonly form = form(
    signal({ nome: inject<string>(MAT_DIALOG_DATA) }),
    (p) => {
      validate(p.nome, ({ value }) =>
        value().trim() ? undefined : { kind: 'obrigatorio', message: 'Dê um nome à lista.' },
      );
      maxLength(p.nome, MAX_NOME, { message: `Use até ${MAX_NOME} caracteres.` });
    },
    {
      submission: {
        action: async (f) => {
          this.ref.close(f.nome().value().replace(/\s+/g, ' ').trim());
          return undefined;
        },
      },
    },
  );
  protected readonly erro = computed(() => erroDoCampo(this.form.nome));
}
