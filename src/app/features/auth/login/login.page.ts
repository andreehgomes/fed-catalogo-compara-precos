import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormField, FormRoot, email, form, minLength, required } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { AuthStore, mensagemErroAuth } from '../../../core/auth/auth.store';
import { erroDoCampo } from '../../../shared/forms/erro-campo';
import { BotaoGoogle } from '../google/botao-google';

@Component({
  selector: 'cp-login',
  imports: [BotaoGoogle, FormField, FormRoot, MatIconModule, NgOptimizedImage, RouterLink],
  templateUrl: './login.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly voltar = input<string>();

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = form(
    signal({ email: '', senha: '' }),
    (p) => {
      required(p.email, { message: 'Informe o e-mail.' });
      email(p.email, { message: 'E-mail inválido.' });
      required(p.senha, { message: 'Informe a senha.' });
      minLength(p.senha, 8, { message: 'A senha tem pelo menos 8 caracteres.' });
    },
    {
      submission: {
        action: async (f) => {
          this.enviando.set(true);
          this.erro.set(null);
          try {
            const { email: e, senha } = f().value();
            await this.auth.entrar(e, senha);
            await this.router.navigateByUrl(this.destino());
          } catch (err) {
            this.erro.set(mensagemErroAuth(err));
          } finally {
            this.enviando.set(false);
          }
          return undefined;
        },
      },
    },
  );

  protected readonly erroEmail = computed(() => erroDoCampo(this.form.email));
  protected readonly erroSenha = computed(() => erroDoCampo(this.form.senha));

  protected destino(): string {
    const v = this.voltar();
    return v && v.startsWith('/') && !v.startsWith('//') ? v : '/';
  }
}
