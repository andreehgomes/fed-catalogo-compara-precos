import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PendentesService } from '../data-access/pendentes.service';
import { PendenteRow } from './pendente-row/pendente-row';

/** "Aguardando a SEFAZ-PR (N)": aparece em Importar, Minhas notas e no painel. */
@Component({
  selector: 'cp-pendentes-bloco',
  imports: [PendenteRow],
  template: `
    @if (servico.pendentes().length) {
      <section class="cp-block" aria-labelledby="pendentes-titulo">
        <h2 id="pendentes-titulo" class="cp-section-title">
          Aguardando a SEFAZ-PR ({{ servico.pendentes().length }})
        </h2>
        <p class="cp-field-hint">
          O site da SEFAZ-PR estava fora do ar. Tentamos de novo sozinhos e avisamos quando a nota
          entrar.
        </p>
        <ul class="cp-list">
          @for (p of servico.pendentes(); track p.chave) {
            <li>
              <cp-pendente-row
                [pendente]="p"
                (retentar)="retentar($event)"
                (excluir)="excluir($event)"
              />
            </li>
          }
        </ul>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendentesBloco {
  protected readonly servico = inject(PendentesService);
  private readonly snack = inject(MatSnackBar);

  protected async retentar(chave: string): Promise<void> {
    const r = await this.servico.retentar(chave);
    this.snack.open(
      r.ok ? 'Vamos tentar de novo agora.' : 'Não foi possível agendar. Tente em instantes.',
      'OK',
      {
        duration: 4000,
      },
    );
  }

  protected async excluir(chave: string): Promise<void> {
    try {
      await this.servico.excluir(chave);
      this.snack.open('Nota pendente excluída.', 'OK', { duration: 3000 });
    } catch {
      this.snack.open('Não foi possível excluir agora.', 'OK', { duration: 4000 });
    }
  }
}
