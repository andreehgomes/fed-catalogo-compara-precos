import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Item, PrecoDeReferencia, rotuloQuantidade } from '../../lista';

@Component({
  selector: 'cp-item-lista',
  imports: [CurrencyPipe, MatIconModule, MatMenuModule],
  template: `
    @let i = item();
    <label class="il-linha">
      <input
        type="checkbox"
        class="il-check"
        [id]="'item-check-' + i.id"
        [checked]="i.marcado"
        [attr.aria-label]="nomeAcessivel()"
        (change)="alternar.emit()"
      />
      <span class="il-corpo">
        <span class="il-texto">{{ i.texto }}</span>
        @if (i.marcado) {
          <span class="cp-sr-only">no carrinho</span>
        }
        @if (referencia(); as r) {
          <span class="item-detalhe"
            >último {{ r.valor | currency }} no {{ r.compra.mercado }}</span
          >
        }
      </span>
      @if (quantidade()) {
        <span class="il-qtd">{{ quantidade() }}</span>
      }
      @if (i.vinculo) {
        <mat-icon class="il-vinculo" aria-hidden="true">link</mat-icon>
        <span class="cp-sr-only">ligado à nota: {{ i.vinculo.descricao }}</span>
      }
    </label>
    <button
      type="button"
      class="cp-btn-icon"
      [matMenuTriggerFor]="acoes"
      [attr.aria-label]="'Ações de ' + i.texto"
    >
      <mat-icon aria-hidden="true">more_vert</mat-icon>
    </button>
    <mat-menu #acoes="matMenu">
      <button mat-menu-item type="button" (click)="editar.emit()">
        <mat-icon aria-hidden="true">edit</mat-icon>
        <span>Editar</span><span class="cp-sr-only">: {{ i.texto }}</span>
      </button>
      <button mat-menu-item type="button" (click)="remover.emit()">
        <mat-icon aria-hidden="true">delete</mat-icon>
        <span>Remover</span><span class="cp-sr-only">: {{ i.texto }}</span>
      </button>
    </mat-menu>
  `,
  styleUrl: './item-lista.scss',
  host: { '[class.il--marcado]': 'item().marcado' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemListaLinha {
  readonly item = input.required<Item>();
  readonly referencia = input<PrecoDeReferencia | null>(null);
  readonly alternar = output();
  readonly editar = output();
  readonly remover = output();

  protected readonly quantidade = computed(() => rotuloQuantidade(this.item()));
  protected readonly nomeAcessivel = computed(() =>
    [this.item().texto, this.quantidade()].filter(Boolean).join(', '),
  );
}
