import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  DOCUMENT,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import type { ItemLista } from '@shared/model';
import { firstValueFrom } from 'rxjs';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ListaStore } from '../data-access/lista.store';
import { ListasStore } from '../data-access/listas.store';
import { manterTelaAcesa } from '../data-access/tela-acesa';
import { Item, faltantes, podeLerOutraNota } from '../lista';
import { DestinoDaLista, FinalizarCompra } from '../ui/finalizar-compra';
import { AdicionarItem } from './ui/adicionar-item';
import { ItemListaLinha } from './ui/item-lista';

@Component({
  selector: 'cp-lista',
  imports: [
    AdicionarItem,
    CurrencyPipe,
    EmptyState,
    FinalizarCompra,
    ItemListaLinha,
    MatIconModule,
    MatMenuModule,
    RouterLink,
  ],
  templateUrl: './lista.page.html',
  styleUrl: './lista.page.scss',
  providers: [ListaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ListaPage {
  protected readonly store = inject(ListaStore);
  private readonly listas = inject(ListasStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly doc = inject(DOCUMENT);
  private readonly avisos = inject(MatSnackBar);

  readonly id = input.required<string>();

  protected readonly mostrarCarrinho = signal(true);
  protected readonly podeCompartilhar = typeof navigator.share === 'function';
  protected readonly buscar = (texto: string) => this.store.sugestoesDe(texto);
  protected readonly temFaltantes = computed(() => faltantes(this.store.itens()).length > 0);
  protected readonly podeLerOutra = computed(() => {
    const l = this.store.lista();
    return !!l && podeLerOutraNota(l, this.store.itens());
  });
  protected readonly semPendentes = computed(
    () => !!this.store.itens().length && !this.store.separados().pendentes.length,
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.store.abrir(id));
    });
    manterTelaAcesa(computed(() => this.store.separados().pendentes.length > 0));
  }

  protected alternar(item: Item): void {
    if (!item.marcado) this.focarProximo(item);
    this.store.marcar(item, !item.marcado);
  }

  protected async editar(item: Item): Promise<void> {
    const { EditarItemDialog } = await import('./ui/editar-item-dialog');
    const dados = await firstValueFrom(
      this.dialog
        .open<unknown, Item, Partial<ItemLista>>(EditarItemDialog, {
          data: item,
          width: '420px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (dados) this.store.editar(item, dados);
  }

  protected async renomear(): Promise<void> {
    const atual = this.store.lista()?.nome ?? '';
    const nome = await this.listas.pedirNome(atual);
    if (nome && nome !== atual) this.store.renomear(nome);
  }

  protected async excluir(): Promise<void> {
    if (!(await this.listas.confirmarExclusao(this.store.lista()?.nome ?? ''))) return;
    this.store.excluir();
    await this.router.navigate(['/listas']);
    this.avisos.open('Lista excluída', 'OK', { duration: 3000 });
  }

  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.store.textoParaCompartilhar());
      this.avisos.open('Lista copiada', 'OK', { duration: 2500 });
    } catch {
      this.avisos.open('Não foi possível copiar.', 'OK', { duration: 3000 });
    }
  }

  protected async compartilhar(): Promise<void> {
    const l = this.store.lista();
    try {
      await navigator.share({
        title: l?.nome ?? 'Lista de compras',
        text: this.store.textoParaCompartilhar(),
      });
    } catch {
      /* compartilhamento cancelado */
    }
  }

  protected async finalizar(destino: DestinoDaLista): Promise<void> {
    if (destino === 'outra-nota') {
      await this.router.navigate(['/importar'], { queryParams: { lista: this.id() } });
      return;
    }
    this.store.finalizar(destino);
    if (destino === 'excluir') {
      await this.router.navigate(['/listas']);
      this.avisos.open('Lista excluída', 'OK', { duration: 3000 });
    } else {
      this.avisos.open(destino === 'guardar' ? 'Lista guardada' : 'Ficou só o que faltou', 'OK', {
        duration: 3000,
      });
    }
  }

  /** Ao marcar, o foco vai para o próximo pendente (o item marcado sai da seção). */
  private focarProximo(item: Item): void {
    const pendentes = this.store.separados().pendentes;
    const i = pendentes.findIndex((p) => p.id === item.id);
    const proximo = pendentes[i + 1] ?? pendentes[i - 1];
    const alvo = proximo
      ? this.doc.getElementById(`item-check-${proximo.id}`)
      : this.doc.querySelector<HTMLElement>('cp-adicionar-item input');
    alvo?.focus();
  }
}
