import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthStore, mensagemErroAuth } from '../../../core/auth/auth.store';

const CANCELADO = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

@Component({
  selector: 'cp-botao-google',
  imports: [MatIconModule],
  template: `
    <button
      class="cp-btn-secondary cp-btn-google"
      type="button"
      [disabled]="entrando()"
      (click)="entrar()"
    >
      <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      {{ entrando() ? 'Abrindo o Google…' : 'Continuar com Google' }}
    </button>
    @if (erro(); as msg) {
      <div class="cp-info-block cp-info-block--erro" role="alert">
        <mat-icon aria-hidden="true">error</mat-icon>{{ msg }}
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BotaoGoogle {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly destino = input('/');

  protected readonly entrando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected async entrar(): Promise<void> {
    this.entrando.set(true);
    this.erro.set(null);
    try {
      if ((await this.auth.entrarComGoogle()) === 'ok') {
        await this.router.navigateByUrl(this.destino());
      }
    } catch (err) {
      const codigo = (err as { code?: string } | null)?.code ?? '';
      if (!CANCELADO.has(codigo)) this.erro.set(mensagemErroAuth(err));
    } finally {
      this.entrando.set(false);
    }
  }
}
