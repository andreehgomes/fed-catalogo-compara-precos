import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { rotuloQuantidade } from '../lista';
import { DestinoDaLista, FinalizarCompra } from '../ui/finalizar-compra';
import { ConferenciaStore } from './conferencia.store';
import type { DadosEscolherPar, OpcaoDePar } from './ui/escolher-par-dialog';
import { ParConferido } from './ui/par-conferido';

@Component({
  selector: 'cp-conferencia',
  imports: [CurrencyPipe, EmptyState, FinalizarCompra, MatIconModule, ParConferido, RouterLink],
  templateUrl: './conferencia.page.html',
  styleUrl: './conferencia.page.scss',
  providers: [ConferenciaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ConferenciaPage {
  protected readonly store = inject(ConferenciaStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly id = input.required<string>();
  readonly chave = input<string>('');

  constructor() {
    effect(() => {
      const id = this.id();
      const chave = this.chave();
      untracked(() => this.store.abrir(id, chave));
    });
  }

  protected async estavaNaNota(itemId: string, texto: string): Promise<void> {
    const opcoes = (this.store.ajustes()?.foraDaLista ?? []).map((n) => ({
      id: String(n.n),
      rotulo: n.descricao,
      detalhe: `${n.qtd} ${n.unidade}`,
    }));
    const n = await this.escolher(`"${texto}" estava na nota como…`, opcoes);
    if (n) this.store.ligar(itemId, Number(n));
  }

  protected async estavaNaLista(n: number, descricao: string): Promise<void> {
    const opcoes = (this.store.ajustes()?.faltou ?? []).map((i) => ({
      id: i.id,
      rotulo: i.texto,
      detalhe: rotuloQuantidade(i) || undefined,
    }));
    const itemId = await this.escolher(`"${descricao}" estava na lista como…`, opcoes);
    if (itemId) this.store.ligar(itemId, n);
  }

  protected salvar(): void {
    this.store.salvar();
    this.snack.open('Conferência salva', 'OK', { duration: 3000 });
  }

  protected async finalizar(destino: DestinoDaLista): Promise<void> {
    if (destino === 'outra-nota') {
      await this.router.navigate(['/importar'], { queryParams: { lista: this.id() } });
      return;
    }
    this.store.finalizar(destino);
    if (destino === 'excluir') {
      await this.router.navigate(['/listas']);
      this.snack.open('Lista excluída', 'OK', { duration: 3000 });
      return;
    }
    await this.router.navigate(['/listas', this.id()]);
    this.snack.open(destino === 'guardar' ? 'Lista guardada' : 'Ficou só o que faltou', 'OK', {
      duration: 3000,
    });
  }

  private async escolher(titulo: string, opcoes: OpcaoDePar[]): Promise<string | null> {
    const { EscolherParDialog } = await import('./ui/escolher-par-dialog');
    const r = await firstValueFrom(
      this.dialog
        .open<unknown, DadosEscolherPar, string>(EscolherParDialog, {
          data: { titulo, opcoes },
          width: '480px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    return r ?? null;
  }
}
