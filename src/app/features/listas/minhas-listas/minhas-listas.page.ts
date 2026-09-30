import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ListasStore } from '../data-access/listas.store';
import { Lista, MAX_LISTAS } from '../lista';

@Component({
  selector: 'cp-minhas-listas',
  imports: [DatePipe, EmptyState, MatIconModule, MatMenuModule, RouterLink],
  templateUrl: './minhas-listas.page.html',
  styleUrl: './minhas-listas.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class MinhasListasPage {
  protected readonly store = inject(ListasStore);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly max = MAX_LISTAS;

  protected nova(): void {
    if (this.store.cheia()) return;
    const id = this.store.criar();
    void this.router.navigate(['/listas', id]);
  }

  protected percentual(l: Lista): number {
    return l.qtdItens ? Math.round((l.qtdMarcados / l.qtdItens) * 100) : 0;
  }

  protected async renomear(l: Lista): Promise<void> {
    const nome = await this.store.pedirNome(l.nome);
    if (nome && nome !== l.nome) this.store.renomear(l.id, nome);
  }

  protected async excluir(l: Lista): Promise<void> {
    if (!(await this.store.confirmarExclusao(l.nome))) return;
    this.store.excluir(l.id);
    this.snack.open('Lista excluída', 'OK', { duration: 3000 });
  }
}
