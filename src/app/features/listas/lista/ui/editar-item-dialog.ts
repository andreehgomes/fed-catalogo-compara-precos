import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, validate } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { ItemLista, UnidadeBase } from '@shared/model';
import { erroDoCampo } from '../../../../shared/forms/erro-campo';
import { Item, MAX_QUANTIDADE, MAX_TEXTO, limitarQuantidade, limparTexto } from '../../lista';

const UNIDADES = ['un', 'kg', 'L'];

@Component({
  selector: 'cp-editar-item-dialog',
  imports: [FormField, FormRoot, MatDialogModule, MatIconModule],
  template: `
    <form class="editar" [formRoot]="form">
      <h2 mat-dialog-title class="cp-section-title">Editar item</h2>
      <label class="cp-field">
        <span>Item</span>
        <input
          type="text"
          autocomplete="off"
          [formField]="form.texto"
          [attr.aria-invalid]="!!erro()"
          [attr.aria-describedby]="erro() ? 'editar-item-erro' : null"
        />
      </label>
      @if (erro(); as msg) {
        <span id="editar-item-erro" class="cp-field-error" role="alert">{{ msg }}</span>
      }
      <div class="editar-qtd">
        <span class="cp-label" id="editar-qtd-rotulo">Quantidade</span>
        <div class="editar-stepper" role="group" aria-labelledby="editar-qtd-rotulo">
          <button
            type="button"
            class="cp-btn-icon"
            aria-label="Diminuir"
            [disabled]="(quantidade() ?? 0) <= passo()"
            (click)="somar(-1)"
          >
            <mat-icon aria-hidden="true">remove</mat-icon>
          </button>
          <input
            type="number"
            inputmode="decimal"
            class="cp-field-compact"
            aria-label="Quantidade"
            [min]="passo()"
            [max]="max"
            [step]="passo()"
            [value]="quantidade() ?? ''"
            (change)="digitar($event)"
          />
          <button type="button" class="cp-btn-icon" aria-label="Aumentar" (click)="somar(1)">
            <mat-icon aria-hidden="true">add</mat-icon>
          </button>
          <select
            class="cp-field-compact"
            aria-label="Unidade"
            [value]="unidade()"
            (change)="unidade.set($any($event.target).value)"
          >
            @for (u of unidades; track u) {
              <option [value]="u">{{ u }}</option>
            }
          </select>
        </div>
        <span class="cp-field-hint">Deixe em branco para não indicar quantidade.</span>
      </div>
      <div class="cp-form-actions">
        <button type="button" class="cp-btn-secondary" mat-dialog-close>Cancelar</button>
        <button type="submit" class="cp-btn-primary">Salvar</button>
      </div>
    </form>
  `,
  styles: `
    .editar {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 22px;
    }

    h2 {
      margin: 0;
      padding: 0;
    }

    .editar-qtd {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .editar-stepper {
      display: flex;
      align-items: center;
      gap: 6px;

      input {
        width: 88px;
        text-align: center;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditarItemDialog {
  private readonly item = inject<Item>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EditarItemDialog, Partial<ItemLista>>);

  protected readonly max = MAX_QUANTIDADE;
  protected readonly quantidade = signal<number | null>(this.item.quantidade);
  protected readonly unidade = signal(this.item.unidade ?? 'un');
  protected readonly unidades = [
    ...new Set([...UNIDADES, ...(this.item.unidade ? [this.item.unidade] : [])]),
  ];
  protected readonly passo = computed(() => (['kg', 'L'].includes(this.unidade()) ? 0.1 : 1));

  protected readonly form = form(
    signal({ texto: this.item.texto }),
    (p) => {
      validate(p.texto, ({ value }) =>
        value().trim() ? undefined : { kind: 'obrigatorio', message: 'Escreva o item.' },
      );
      maxLength(p.texto, MAX_TEXTO, { message: `Use até ${MAX_TEXTO} caracteres.` });
    },
    {
      submission: {
        action: async (f) => {
          this.ref.close(this.dados(f.texto().value()));
          return undefined;
        },
      },
    },
  );
  protected readonly erro = computed(() => erroDoCampo(this.form.texto));

  protected somar(sinal: 1 | -1): void {
    const atual = this.quantidade() ?? 0;
    this.quantidade.set(limitarQuantidade(Math.round((atual + sinal * this.passo()) * 10) / 10));
  }

  protected digitar(e: Event): void {
    const valor = (e.target as HTMLInputElement).value;
    this.quantidade.set(valor === '' ? null : limitarQuantidade(Number(valor)));
  }

  private dados(texto: string): Partial<ItemLista> {
    const quantidade = this.quantidade();
    const unidade = quantidade === null ? null : this.unidade();
    let base: UnidadeBase | null = null;
    if (unidade === this.item.unidade) base = this.item.base;
    else if (unidade === 'kg' || unidade === 'L') base = unidade;
    return { texto: limparTexto(texto), quantidade, unidade, base };
  }
}
