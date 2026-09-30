import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormField, form, maxLength, validate } from '@angular/forms/signals';
import { MAX_APELIDO, limparApelido } from '@shared/apelido';

const MENSAGEM = 'Esse nome não serve. Use de 2 a 60 caracteres, com letras.';

let sequencia = 0;

@Component({
  selector: 'cp-campo-apelido',
  imports: [FormField],
  template: `
    <label class="cp-field">
      <span>Como você chama esta loja?</span>
      <input
        type="text"
        autocomplete="off"
        autocapitalize="words"
        [formField]="form"
        [attr.aria-invalid]="!!erro()"
        [attr.aria-describedby]="erro() ? idErro + ' ' + idAjuda : idAjuda"
      />
    </label>
    <span [id]="idAjuda" class="cp-field-hint"
      >Só você vê esse nome. Deixe em branco para usar o nome oficial.</span
    >
    @if (erro(); as msg) {
      <span [id]="idErro" class="cp-field-error" role="alert">{{ msg }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampoApelido {
  readonly valor = model<string>('');
  readonly nomeOficial = input('');
  readonly erroServidor = input<string | null>(null);

  protected readonly idAjuda = `apelido-ajuda-${++sequencia}`;
  protected readonly idErro = `apelido-erro-${sequencia}`;

  protected readonly form = form(this.valor, (p) => {
    maxLength(p, MAX_APELIDO, { message: MENSAGEM });
    validate(p, ({ value }) =>
      limparApelido(value(), this.nomeOficial()).valido
        ? undefined
        : { kind: 'apelido', message: MENSAGEM },
    );
  });

  readonly valido = computed(() => this.form().valid());

  protected readonly erro = computed(() => {
    const estado = this.form();
    if (estado.invalid() && (estado.dirty() || estado.touched()))
      return estado.errors()[0]?.message ?? MENSAGEM;
    return this.erroServidor();
  });
}
