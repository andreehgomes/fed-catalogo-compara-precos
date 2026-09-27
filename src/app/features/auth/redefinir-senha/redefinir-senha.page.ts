import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthStore, mensagemErroAuth } from '../../../core/auth/auth.store';
import { erroDoCampo } from '../../../shared/forms/erro-campo';

@Component({
  selector: 'cp-redefinir-senha',
  imports: [FormField, FormRoot, MatIconModule, RouterLink],
  templateUrl: './redefinir-senha.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RedefinirSenhaPage {
  private readonly auth = inject(AuthStore);

  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = form(
    signal({ email: '' }),
    (p) => {
      required(p.email, { message: 'Informe o e-mail.' });
      email(p.email, { message: 'E-mail inválido.' });
    },
    {
      submission: {
        action: async (f) => {
          this.enviando.set(true);
          this.erro.set(null);
          try {
            await this.auth.redefinirSenha(f().value().email);
            this.enviado.set(true);
          } catch (err) {
            const codigo = (err as { code?: string }).code;
            if (codigo === 'auth/user-not-found') this.enviado.set(true);
            else this.erro.set(mensagemErroAuth(err));
          } finally {
            this.enviando.set(false);
          }
          return undefined;
        },
      },
    },
  );

  protected readonly erroEmail = computed(() => erroDoCampo(this.form.email));
}
